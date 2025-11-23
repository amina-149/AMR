import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, MicOff, MessageCircle, User, Stethoscope, Wheat, AlertTriangle, CheckCircle, QrCode, Globe } from 'lucide-react';
import { DatabaseService } from '../services/database-service';
import { AirtableService } from '../services/airtable-service';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  language?: string;
  amrReport?: any;
}

interface UserProfile {
  id: string;
  name: string;
  phone: string;
  type: 'farmer' | 'livestock' | 'vet' | 'general';
  language: string;
  location: string;
}

const KisaanPukaarChatbot: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dbConnected, setDbConnected] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [amrReports, setAmrReports] = useState<any[]>([]);
  const [showQR, setShowQR] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('ur');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const databaseService = useRef<DatabaseService | null>(null);
  const airtableService = useRef<AirtableService | null>(null);

  const languages = [
    { code: 'ur', name: 'اردو', flag: '🇵🇰' },
    { code: 'pa', name: 'پنجابی', flag: '🇵🇰' },
    { code: 'ps', name: 'پشتو', flag: '🇵🇰' },
    { code: 'sd', name: 'سندھی', flag: '🇵🇰' },
    { code: 'bal', name: 'بلوچی', flag: '🇵🇰' },
    { code: 'en', name: 'English', flag: '🇬🇧' }
  ];

  const userTypes = [
    { id: 'farmer', name: 'کسان', icon: Wheat },
    { id: 'livestock', name: 'مویشی پال', icon: User },
    { id: 'vet', name: 'ویٹرنری ڈاکٹر', icon: Stethoscope },
    { id: 'general', name: 'عام صارف', icon: User }
  ];

  // Initialize database service
  useEffect(() => {
    const initDatabase = async () => {
      try {
        // Try Airtable first
        airtableService.current = AirtableService.getInstance();
        const airtableConnected = await airtableService.current.connect();
        
        if (airtableConnected) {
          setDbConnected(true);
          console.log('Connected to Airtable database');
          
          // Load sample data from Airtable
          const sampleReports = await airtableService.current.getRecords('amr_reports');
          if (sampleReports.length > 0) {
            setAmrReports(sampleReports.map((record: any) => record.fields));
          }
        } else {
          // Fallback to mock database
          databaseService.current = DatabaseService.getInstance();
          const connected = await databaseService.current.connect();
          setDbConnected(connected);
          
          if (connected) {
            const profile = await databaseService.current.getUserProfile('current-user');
            if (profile) {
              setUserProfile(profile);
              const reports = await databaseService.current.getUserAMRReports(profile.id);
              setAmrReports(reports);
            }
          }
        }
      } catch (error) {
        console.error('Database initialization failed:', error);
      }
    };
    
    initDatabase();
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = selectedLanguage === 'ur' ? 'ur-PK' : 'en-US';
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        setIsListening(false);
      };
      
      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };
      
      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, [selectedLanguage]);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message and generate AMR report
  const sendMessage = async () => {
    if (!inputText.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
      language: selectedLanguage
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    
    try {
      // Generate AMR response using Gemini API
      const response = await generateAMRResponse(inputText, selectedLanguage);
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text,
        sender: 'bot',
        timestamp: new Date(),
        language: selectedLanguage,
        amrReport: response.report
      };
      
      setMessages(prev => [...prev, botMessage]);
      
      // Save to database if connected
      if (dbConnected && databaseService.current) {
        await databaseService.current.saveWhatsAppMessage({
          from: userProfile?.phone || 'anonymous',
          to: 'bot',
          message: inputText,
          response: response.text,
          amrReport: response.report
        });
        
        // Generate AMR report if applicable
        if (response.report) {
          const report = await databaseService.current.createAMRReport({
            userId: userProfile?.id || 'anonymous',
            message: inputText,
            analysis: response.report,
            recommendations: response.text
          });
          
          if (report) {
            setAmrReports(prev => [...prev, report]);
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'معذرت، پیغام بھیجنے میں مسئلہ پیش آیا۔ براہ کرم دوبارہ کوشش کریں۔',
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Generate AMR response using Gemini API
  const generateAMRResponse = async (message: string, language: string) => {
    const prompt = `You are an AMR (Antimicrobial Resistance) Medical Assistant for Pakistani farmers and livestock owners. 
    Language: ${language}
    User Type: ${userProfile?.type || 'general'}
    Location: ${userProfile?.location || 'Pakistan'}
    
    User Message: ${message}
    
    Provide:
    1. A helpful response about antimicrobial resistance
    2. AMR analysis report if the message contains medical/animal health content
    3. Recommendations in simple, local language
    4. Safety warnings if applicable
    
    Response format:
    {
      "text": "your response here",
      "report": {
        "type": "amr_analysis",
        "risk_level": "low|medium|high",
        "recommendations": ["rec1", "rec2"],
        "warnings": ["warning1", "warning2"]
      }
    }`;
    
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + (window as any).AMR_CONFIG.GEMINI_API_KEY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      });
      
      const data = await response.json();
      const generatedText = data.candidates[0].content.parts[0].text;
      
      // Parse the response to extract text and report
      let text = generatedText;
      let report = null;
      
      try {
        const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          text = parsed.text || generatedText;
          report = parsed.report;
        }
      } catch (e) {
        // If JSON parsing fails, use the full text
      }
      
      return { text, report };
    } catch (error) {
      console.error('Gemini API error:', error);
      return {
        text: 'معذرت، اس وقت جواب تیار کرنے میں مسئلہ ہے۔ براہ کرم تھوڑی دیر بعد دوبارہ کوشش کریں۔',
        report: null
      };
    }
  };

  // Toggle voice recognition
  const toggleVoiceRecognition = () => {
    if (!recognitionRef.current) {
      alert('آپ کا براؤزر آواز کی پہچان کی سہولت فراہم نہیں کرتا۔');
      return;
    }
    
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Generate QR code for WhatsApp registration
  const generateQRCode = () => {
    // const whatsappNumber = (window as any).AMR_CONFIG.WHATSAPP_NUMBER;
    // const message = encodeURIComponent('AMR میڈیکل اسسٹنٹ میں خوش آمدید');
    // const whatsappUrl = `https://wa.me/${whatsappNumber.replace('whatsapp:', '')}?text=${message}`;
    setShowQR(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-sky-50">
      {/* Header */}
      <header className="bg-amr-green text-white p-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Stethoscope className="h-8 w-8" />
            <div>
              <h1 className="text-xl font-bold">AMR میڈیکل اسسٹنٹ</h1>
              <p className="text-sm opacity-90">اینٹی مائکروبیل مزاحمت کے خلاف مہم</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Database Status */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${dbConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span className="text-sm">{dbConnected ? 'ڈیٹا بیس جڑا ہوا' : 'ڈیٹا بیس منقطع'}</span>
            </div>
            
            {/* Language Selector */}
            <select 
              value={selectedLanguage} 
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="bg-white text-amr-green px-3 py-1 rounded-md text-sm"
            >
              {languages.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
              ))}
            </select>
            
            {/* QR Code Button */}
            <button
              onClick={generateQRCode}
              className="bg-amr-sky hover:bg-sky-600 px-3 py-1 rounded-md flex items-center space-x-1"
            >
              <QrCode className="h-4 w-4" />
              <span className="text-sm">وہٹس ایپ</span>
            </button>
          </div>
        </div>
      </header>

      {/* User Profile Section */}
      {!userProfile && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 m-4">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-lg font-semibold text-yellow-800 mb-3">اپنا پروفائل بنائیں</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {userTypes.map(type => {
                const IconComponent = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => setUserProfile({
                      id: 'current-user',
                      name: 'صارف',
                      phone: '+92',
                      type: type.id as any,
                      language: selectedLanguage,
                      location: 'Pakistan'
                    })}
                    className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-amr-green hover:bg-green-50 transition-colors"
                  >
                    <IconComponent className="h-8 w-8 mx-auto mb-2 text-amr-green" />
                    <span className="text-sm font-medium">{type.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Chat Container */}
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow-lg h-96 overflow-hidden">
          {/* Messages */}
          <div className="h-80 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">AMR میڈیکل اسسٹنٹ میں خوش آمدید</p>
                <p className="text-sm mt-2">اینٹی مائکروبیل مزاحمت کے بارے میں سوالات پوچھیں</p>
              </div>
            ) : (
              messages.map(message => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.sender === 'user'
                        ? 'bg-amr-green text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-sm">{message.text}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {message.timestamp.toLocaleTimeString('ur-PK')}
                    </p>
                    {message.amrReport && (
                      <div className="mt-2 p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                        <div className="flex items-center space-x-1">
                          <AlertTriangle className="h-4 w-4 text-blue-600" />
                          <span className="text-xs font-medium text-blue-800">AMR رپورٹ</span>
                        </div>
                        <p className="text-xs text-blue-700 mt-1">
                          خطرہ کی سطح: {message.amrReport.risk_level}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t p-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleVoiceRecognition}
                className={`p-2 rounded-full ${
                  isListening
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
              >
                {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && sendMessage()}
                placeholder="اپنا پیغام ٹائپ کریں..."
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amr-green"
                disabled={isLoading}
              />
              
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputText.trim()}
                className="bg-amr-green text-white p-2 rounded-full hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* AMR Reports Section */}
        {amrReports.length > 0 && (
          <div className="mt-6 bg-white rounded-lg shadow-lg p-4">
            <h3 className="text-lg font-semibold text-amr-green mb-3 flex items-center">
              <CheckCircle className="h-5 w-5 mr-2" />
              آپ کی AMR رپورٹس
            </h3>
            <div className="space-y-2">
              {amrReports.slice(-3).map((report, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-3 border-l-4 border-amr-green">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{report.analysis?.type || 'AMR تجزیہ'}</span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      report.riskLevel === 'high' ? 'bg-red-100 text-red-800' :
                      report.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {report.riskLevel === 'high' ? 'زیادہ خطرہ' :
                       report.riskLevel === 'medium' ? 'درمیانہ خطرہ' :
                       'کم خطرہ'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{report.createdAt}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-amr-green mb-4">وہٹس ایپ رجسٹریشن</h3>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">
                QR کوڈ اسکین کر کے AMR میڈیکل اسسٹنٹ سے وہٹس ایپ پر رابطہ کریں
              </p>
              <div className="bg-gray-100 rounded-lg p-8 mb-4">
                <QrCode className="h-32 w-32 mx-auto text-gray-400" />
                <p className="text-xs text-gray-500 mt-2">QR کوڈ یہاں ظاہر ہوگا</p>
              </div>
              <button
                onClick={() => setShowQR(false)}
                className="bg-amr-green text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                بند کریں
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-amr-green text-white p-4 mt-8">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm">
            <Globe className="h-4 w-4 inline mr-1" />
            پاکستان حکومت کے زیر اہتمام AMR مہم
          </p>
          <p className="text-xs opacity-75 mt-1">
            یہ معلومات صرف تعلیمی مقاصد کے لیے ہیں۔ طبی مشورے کے لیے ماہر سے رابطہ کریں۔
          </p>
        </div>
      </footer>
    </div>
  );
};

export default KisaanPukaarChatbot;