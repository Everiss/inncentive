import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

export type FormpdStatus =
  | 'PENDING_REVIEW'
  | 'CNPJ_MISMATCH'
  | 'COMPANY_NOT_FOUND'
  | 'INVALID_FORMPD'
  | 'ERROR';

export interface FormpdCompletedPayload {
  batchId: number;
  status: FormpdStatus;
  cnpjFromForm: string | null;
  companyId: number | null;
  companyName: string | null;
  errorMessage?: string;
}

export interface FormpdCompanyRegisteredPayload {
  batchId: number;
  companyId: number;
  companyName: string;
  cnpj: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('NotificationsGateway');

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  sendProgress(data: { current: number, total: number, message: string }) {
    this.server.emit('import:progress', data);
  }

  sendCompleted(data: { success: number, failed: number, total: number }) {
    this.server.emit('import:completed', data);
  }

  sendFormpdCompleted(data: FormpdCompletedPayload) {
    this.server.emit('formpd:completed', data);
  }

  sendFormpdCompanyRegistered(data: FormpdCompanyRegisteredPayload) {
    this.server.emit('formpd:company-registered', data);
  }
}
