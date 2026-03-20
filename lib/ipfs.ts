/**
 * IPFS Integration Library for BountyForge
 * 
 * Handles uploading/downloading content to/from IPFS.
 * Supports multiple backends: Pinata (production) and local node (dev).
 */

import * as fs from 'fs';
import * as path from 'path';

// IPFS Gateway URLs for fetching content
const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://dweb.link/ipfs/',
];

// Pinata API endpoints
const PINATA_API_URL = 'https://api.pinata.cloud';
const PINATA_PIN_FILE_URL = `${PINATA_API_URL}/pinning/pinFileToIPFS`;
const PINATA_PIN_JSON_URL = `${PINATA_API_URL}/pinning/pinJSONToIPFS`;

export interface IPFSConfig {
  pinataApiKey?: string;
  pinataSecretKey?: string;
  gateway?: string;
}

export interface UploadResult {
  cid: string;
  size: number;
  url: string;
}

export interface PinataMetadata {
  name?: string;
  keyvalues?: Record<string, string>;
}

/**
 * IPFS Client for uploading and downloading content
 */
export class IPFSClient {
  private pinataApiKey?: string;
  private pinataSecretKey?: string;
  private gateway: string;

  constructor(config: IPFSConfig = {}) {
    this.pinataApiKey = config.pinataApiKey || process.env.PINATA_API_KEY;
    this.pinataSecretKey = config.pinataSecretKey || process.env.PINATA_SECRET_KEY;
    this.gateway = config.gateway || IPFS_GATEWAYS[0];
  }

  /**
   * Check if Pinata credentials are configured
   */
  isPinataConfigured(): boolean {
    return !!(this.pinataApiKey && this.pinataSecretKey);
  }

  /**
   * Upload a file to IPFS via Pinata
   */
  async uploadFile(
    filePath: string,
    metadata?: PinataMetadata
  ): Promise<UploadResult> {
    if (!this.isPinataConfigured()) {
      throw new Error('Pinata credentials not configured. Set PINATA_API_KEY and PINATA_SECRET_KEY');
    }

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    // Create form data
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename: fileName });

    if (metadata) {
      formData.append('pinataMetadata', JSON.stringify({
        name: metadata.name || fileName,
        keyvalues: metadata.keyvalues || {},
      }));
    }

    const response = await fetch(PINATA_PIN_FILE_URL, {
      method: 'POST',
      headers: {
        'pinata_api_key': this.pinataApiKey!,
        'pinata_secret_api_key': this.pinataSecretKey!,
        ...formData.getHeaders(),
      },
      body: formData as any,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata upload failed: ${error}`);
    }

    const result = await response.json() as { IpfsHash: string; PinSize: number };
    
    return {
      cid: result.IpfsHash,
      size: result.PinSize,
      url: `${this.gateway}${result.IpfsHash}`,
    };
  }

  /**
   * Upload raw buffer to IPFS via Pinata
   */
  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    metadata?: PinataMetadata
  ): Promise<UploadResult> {
    if (!this.isPinataConfigured()) {
      throw new Error('Pinata credentials not configured. Set PINATA_API_KEY and PINATA_SECRET_KEY');
    }

    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', buffer, { filename: fileName });

    if (metadata) {
      formData.append('pinataMetadata', JSON.stringify({
        name: metadata.name || fileName,
        keyvalues: metadata.keyvalues || {},
      }));
    }

    const response = await fetch(PINATA_PIN_FILE_URL, {
      method: 'POST',
      headers: {
        'pinata_api_key': this.pinataApiKey!,
        'pinata_secret_api_key': this.pinataSecretKey!,
        ...formData.getHeaders(),
      },
      body: formData as any,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata upload failed: ${error}`);
    }

    const result = await response.json() as { IpfsHash: string; PinSize: number };
    
    return {
      cid: result.IpfsHash,
      size: result.PinSize,
      url: `${this.gateway}${result.IpfsHash}`,
    };
  }

  /**
   * Upload string content to IPFS via Pinata
   */
  async uploadString(
    content: string,
    fileName: string,
    metadata?: PinataMetadata
  ): Promise<UploadResult> {
    return this.uploadBuffer(Buffer.from(content, 'utf-8'), fileName, metadata);
  }

  /**
   * Upload JSON to IPFS via Pinata
   */
  async uploadJSON(
    json: object,
    metadata?: PinataMetadata
  ): Promise<UploadResult> {
    if (!this.isPinataConfigured()) {
      throw new Error('Pinata credentials not configured. Set PINATA_API_KEY and PINATA_SECRET_KEY');
    }

    const body: any = {
      pinataContent: json,
    };

    if (metadata) {
      body.pinataMetadata = {
        name: metadata.name || 'json-content',
        keyvalues: metadata.keyvalues || {},
      };
    }

    const response = await fetch(PINATA_PIN_JSON_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'pinata_api_key': this.pinataApiKey!,
        'pinata_secret_api_key': this.pinataSecretKey!,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata JSON upload failed: ${error}`);
    }

    const result = await response.json() as { IpfsHash: string; PinSize: number };
    
    return {
      cid: result.IpfsHash,
      size: result.PinSize,
      url: `${this.gateway}${result.IpfsHash}`,
    };
  }

  /**
   * Fetch content from IPFS by CID
   * Tries multiple gateways for reliability
   */
  async fetch(cid: string): Promise<Buffer> {
    const errors: string[] = [];

    for (const gateway of IPFS_GATEWAYS) {
      try {
        const url = `${gateway}${cid}`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
        
        errors.push(`${gateway}: HTTP ${response.status}`);
      } catch (error) {
        errors.push(`${gateway}: ${(error as Error).message}`);
      }
    }

    throw new Error(`Failed to fetch CID ${cid} from all gateways: ${errors.join('; ')}`);
  }

  /**
   * Fetch content as string from IPFS
   */
  async fetchString(cid: string): Promise<string> {
    const buffer = await this.fetch(cid);
    return buffer.toString('utf-8');
  }

  /**
   * Fetch JSON from IPFS
   */
  async fetchJSON<T = any>(cid: string): Promise<T> {
    const content = await this.fetchString(cid);
    return JSON.parse(content);
  }

  /**
   * Download file from IPFS to local path
   */
  async download(cid: string, outputPath: string): Promise<void> {
    const buffer = await this.fetch(cid);
    fs.writeFileSync(outputPath, buffer);
  }

  /**
   * Get the URL for a CID
   */
  getUrl(cid: string): string {
    return `${this.gateway}${cid}`;
  }

  /**
   * Verify a CID exists and is accessible
   */
  async verify(cid: string): Promise<boolean> {
    try {
      await this.fetch(cid);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a configured IPFS client
 */
export function createIPFSClient(config?: IPFSConfig): IPFSClient {
  return new IPFSClient(config);
}

/**
 * Helper to extract CID from various IPFS URL formats
 */
export function extractCID(input: string): string {
  // Direct CID (starts with Qm or bafy)
  if (input.startsWith('Qm') || input.startsWith('bafy')) {
    return input;
  }

  // IPFS protocol URL: ipfs://CID
  if (input.startsWith('ipfs://')) {
    return input.replace('ipfs://', '').split('/')[0];
  }

  // HTTP gateway URL
  const gatewayMatch = input.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (gatewayMatch) {
    return gatewayMatch[1];
  }

  throw new Error(`Could not extract CID from: ${input}`);
}

// Default export for convenience
export default IPFSClient;
