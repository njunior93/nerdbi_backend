import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { User } from '../auth/Entity/user.entity';
import { SaveConnectionDto } from './Dto/save-connection.dto';
import { TestConnectionDto } from './Dto/test-connection.dto';
import { ConnectionStatusDto } from './Dto/connection-status.dto';
import { TestConnectionResponseDto } from './Dto/test-connection-response.dto';
import encryptionConfig from './Config/encryption.config';

@Injectable()
export class ConnectionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly ivLength = 16;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(encryptionConfig.KEY)
    private readonly encConfig: { key: string },
  ) {}

  async save(
    userId: string,
    dto: SaveConnectionDto,
  ): Promise<ConnectionStatusDto> {
    await this.verifyConnection(dto.connectionString);

    const encrypted = this.encrypt(dto.connectionString);
    await this.userRepository.update(userId, { connectionString: encrypted });

    return { hasConnection: true };
  }

  async test(dto: TestConnectionDto): Promise<TestConnectionResponseDto> {
    await this.verifyConnection(dto.connectionString);
    return { success: true };
  }

  async getStatus(userId: string): Promise<ConnectionStatusDto> {
    const user = await this.userRepository.findOneBy({ id: userId });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return { hasConnection: !!user.connectionString };
  }

  async getDecryptedConnectionString(userId: string): Promise<string> {
    const user = await this.userRepository.findOneBy({ id: userId });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!user.connectionString) {
      throw new NotFoundException(
        'Nenhuma connection string configurada para este usuário',
      );
    }

    return this.decrypt(user.connectionString);
  }

  private requireTransactionPoolingPort(connectionString: string): void {
    const PORT_ERROR =
      'Use a connection string com connection pooling em modo transaction (porta 6543). ' +
      'Conexões diretas ao banco não são suportadas.';
    const MALFORMED_ERROR =
      'Connection string inválida. Verifique o formato e tente novamente.';
    const ENCODING_ERROR =
      'A senha na connection string contém caracteres especiais (como @, /, # ou :) ' +
      'que precisam ser URL-encoded. Substitua-os antes de usar: ' +
      '@ → %40, / → %2F, # → %23, : → %3A. ' +
      'Dica: use encodeURIComponent(suaSenha) no console do navegador para gerar a versão correta.';

    // Tentativa 1: parsing padrão via URL API
    try {
      const url = new URL(connectionString);
      const port = url.port || '5432';
      if (port !== '6543') throw new BadRequestException(PORT_ERROR);
      return;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // URL parsing falhou — aplicar heurística para distinguir os casos
    }

    // Tentativa 2: localizar host:porta após o último '@'
    // Em uma postgres URL, o segmento host:porta sempre vem após o último '@' da string,
    // pois o host nunca contém '@'. Isso permite extrair a porta mesmo quando a senha
    // contém chars especiais que corrompem o parsing da URL API.
    const lastAt = connectionString.lastIndexOf('@');
    if (lastAt === -1) {
      throw new BadRequestException(MALFORMED_ERROR);
    }

    const afterAt = connectionString.slice(lastAt + 1);
    // Aceita hostname comum ou IPv6 entre colchetes, seguido de :porta
    const portMatch = afterAt.match(/^(?:\[[^\]]+\]|[^:\/]+):(\d+)/);
    if (!portMatch) {
      throw new BadRequestException(MALFORMED_ERROR);
    }

    const port = portMatch[1];
    if (port !== '6543') {
      throw new BadRequestException(PORT_ERROR);
    }

    // Porta correta (6543) mas URL API falhou → muito provavelmente senha com chars especiais
    throw new BadRequestException(ENCODING_ERROR);
  }

  private async verifyConnection(connectionString: string): Promise<void> {
    this.requireTransactionPoolingPort(connectionString);

    const dataSource = new DataSource({
      type: 'postgres',
      url: connectionString,
      ssl: { rejectUnauthorized: false },
      connectTimeoutMS: 5000,
    });

    try {
      await dataSource.initialize();
    } catch {
      throw new BadRequestException(
        'Não foi possível conectar ao banco de dados. Verifique a connection string.',
      );
    } finally {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }
  }

  private encrypt(text: string): string {
    const key = Buffer.from(this.encConfig.key, 'hex');
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(ciphertext: string): string {
    const [ivHex, encHex] = ciphertext.split(':');
    const key = Buffer.from(this.encConfig.key, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
