import {
  executarChamadaRfb,
  getRfbConfig,
  ErroIntegracaoRfb,
} from '../rfb-health';
import {
  DanfseXmlInputSchema,
  DanfseOpcoesSchema,
  type DanfseOpcoes,
} from './schema';

export interface RespostaDanfsePdf {
  pdfBuffer: Buffer;
  contentType: 'application/pdf';
  duracaoMs: number;
}

/**
 * Invoca o microsserviço oficial da Receita Federal (calculadora-rtc-gerador-danfse)
 * para renderizar o DANFSe em PDF a partir do XML da NFS-e.
 * Endpoint confirmado: POST /api/danfse
 */
export async function gerarDanfsePdfRfb(
  xmlContent: string,
  opcoes?: DanfseOpcoes
): Promise<RespostaDanfsePdf> {
  // Validação Zod estrita de tamanho, formato e trava anti-XXE
  DanfseXmlInputSchema.parse(xmlContent);
  const parsedOpcoes = DanfseOpcoesSchema.parse(opcoes ?? {});

  const cfg = getRfbConfig();
  const query = new URLSearchParams({
    stc: parsedOpcoes.stc,
    canhoto: String(parsedOpcoes.canhoto),
  });

  const url = `${cfg.danfseUrl}/api/danfse?${query.toString()}`;

  const { data, duracaoMs } = await executarChamadaRfb<Buffer>(
    'rtc-danfse',
    (signal) =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          Accept: 'application/pdf',
        },
        body: xmlContent,
        signal,
      }),
    async (response) => {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Validação dos magic bytes do PDF (%PDF- / 0x25 0x50 0x44 0x46 0x2D)
      if (
        buffer.length < 5 ||
        buffer[0] !== 0x25 ||
        buffer[1] !== 0x50 ||
        buffer[2] !== 0x44 ||
        buffer[3] !== 0x46 ||
        buffer[4] !== 0x2d
      ) {
        throw new ErroIntegracaoRfb({
          servico: 'rtc-danfse',
          status: 502,
          mensagem: 'A resposta do serviço rtc-danfse não possui assinatura de arquivo PDF válida (%PDF-)',
          codigo: 'PDF_SIGNATURE_INVALID',
          circuitBreakerState: 'CLOSED',
        });
      }

      return buffer;
    }
  );

  return {
    pdfBuffer: data,
    contentType: 'application/pdf',
    duracaoMs,
  };
}
