import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

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

  sendFormpdCompleted(data: {
    batchId: number;
    isValidFormpd: boolean;
    validationError?: string;
    cnpjFromForm: string | null;
    companyId: number | null;
    companyName: string | null;
    companyRegistrationQueued: boolean;
  }) {
    this.server.emit('formpd:completed', data);
  }
}
