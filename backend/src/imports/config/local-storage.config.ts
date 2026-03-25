import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';

export const dynamicLocalStorage = diskStorage({
  destination: (req: any, file, cb) => {
    // Pega os dados do body (enviados no FormData do frontend)
    const cnpj = req.body.cnpj?.replace(/\D/g, '') || '00000000000000';
    const anoBase = req.body.anoBase || new Date().getFullYear().toString();
    const entityType = req.body.entityType || 'GERAL'; // Ex: FORMPD
    
    // Cria o caminho seguindo a regra: upload/CNPJ/ANO_BASE/ENTITY_TYPE/
    // Ex: upload/12345/2024/FORMPD/
    const destPath = path.join(process.cwd(), 'upload', cnpj, anoBase, entityType);
    
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }
    
    cb(null, destPath);
  },
  filename: (req, file, cb) => {
    // Adiciona timestamp para evitar colisão de nomes e limpa o nome do arquivo
    const timestamp = Date.now();
    const cleanFileName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${timestamp}-${cleanFileName}`);
  }
});
