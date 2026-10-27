import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { config } from '../../config';

export const EVENTO_RESULTADOS = 'resultados:actualizados';

/**
 * Namespace /resultados. El evento no lleva datos personales: los clientes vuelven a pedir
 * los resultados por REST (TanStack Query) al recibirlo.
 */
@WebSocketGateway({ namespace: '/resultados', cors: { origin: config.webOrigin, credentials: true } })
export class ResultadosGateway {
  private readonly logger = new Logger(ResultadosGateway.name);

  @WebSocketServer()
  server: Server;

  notificar(motivo: 'voto' | 'proceso' | 'importacion' | 'seguimiento', procesoId?: string) {
    if (!this.server) return;
    this.server.emit(EVENTO_RESULTADOS, { motivo, procesoId: procesoId ?? null, en: new Date().toISOString() });
    this.logger.debug(`${EVENTO_RESULTADOS} (${motivo})`);
  }
}
