import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ReceitaWsClient {
  private readonly logger = new Logger(ReceitaWsClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async fetchCnpj(cnpj: string): Promise<any> {
    const rawToken = this.configService.get<string>('RECEITA_WS_TOKEN') || '';
    const token = rawToken.replace(/"/g, '').trim();
    const baseUrl = (this.configService.get<string>('RECEITA_WS_BASE_URL') || 'https://www.receitaws.com.br/v1/cnpj/').trim();
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = token ? `${normalizedBase}${cnpj}/days/30` : `${normalizedBase}${cnpj}`;

    this.logger.log(`Consultando CNPJ ${cnpj} via ReceitaWS (${token ? 'Comercial' : 'Publica'})`);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const { data } = await firstValueFrom(this.httpService.get(url, { headers, timeout: 15000 }));
    return data;
  }
}

