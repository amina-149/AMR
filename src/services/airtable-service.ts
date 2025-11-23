export class AirtableService {
  private static instance: AirtableService;
  private apiKey: string;
  private baseId: string;
  private connectionStatus: boolean = false;
  
  private constructor() {
    // @ts-ignore - Vite environment variables
    this.apiKey = import.meta.env.VITE_AIRTABLE_API_KEY || '';
    // @ts-ignore - Vite environment variables
    this.baseId = import.meta.env.VITE_AIRTABLE_BASE_ID || '';
  }
  
  static getInstance(): AirtableService {
    if (!AirtableService.instance) {
      AirtableService.instance = new AirtableService();
    }
    return AirtableService.instance;
  }
  
  async connect(): Promise<boolean> {
    try {
      if (!this.apiKey || !this.baseId) {
        console.warn('Airtable credentials not configured');
        return false;
      }
      
      // Test connection by making a simple API call
      const response = await fetch(`https://api.airtable.com/v0/${this.baseId}/amr_reports`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      this.connectionStatus = response.ok;
      return response.ok;
    } catch (error) {
      console.error('Airtable connection failed:', error);
      this.connectionStatus = false;
      return false;
    }
  }
  
  async createRecord(tableName: string, fields: any): Promise<any> {
    if (!this.connectionStatus) return null;
    
    try {
      const response = await fetch(`https://api.airtable.com/v0/${this.baseId}/${tableName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: fields
        })
      });
      
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error('Error creating Airtable record:', error);
      return null;
    }
  }
  
  async getRecords(tableName: string, filter?: string): Promise<any[]> {
    if (!this.connectionStatus) return [];
    
    try {
      const url = new URL(`https://api.airtable.com/v0/${this.baseId}/${tableName}`);
      if (filter) {
        url.searchParams.set('filterByFormula', filter);
      }
      
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.records || [];
      }
      return [];
    } catch (error) {
      console.error('Error getting Airtable records:', error);
      return [];
    }
  }
  
  async updateRecord(tableName: string, recordId: string, fields: any): Promise<any> {
    if (!this.connectionStatus) return null;
    
    try {
      const response = await fetch(`https://api.airtable.com/v0/${this.baseId}/${tableName}/${recordId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: fields
        })
      });
      
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error('Error updating Airtable record:', error);
      return null;
    }
  }
  
  isConnected(): boolean {
    return this.connectionStatus;
  }
}