import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class NotificationServiceClient {
  private readonly logger = new Logger(NotificationServiceClient.name);
  private readonly http: AxiosInstance;

  constructor() {
    const baseURL = process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:8050';
    this.http = axios.create({ baseURL, timeout: 5000 });
  }

  async publish(eventName: string, payload: unknown) {
    try {
      await this.http.post('/events', { eventName, payload });
    } catch (error: any) {
      this.logger.warn(`Falha ao publicar evento "${eventName}" no notification-service: ${error.message}`);
    }
  }
}

