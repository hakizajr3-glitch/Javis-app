import { v4 as uuidv4 } from 'uuid';
import {
  ConnectorId,
  BaseConnector,
  ConnectorCapability,
  ConnectorParameter,
  ConnectorHealth,
} from '../types.js';
import { promises as fs } from 'fs';
import path from 'path';

export class FileSystemConnector implements BaseConnector {
  id: ConnectorId;
  name: string;
  type: string;
  version: string;
  private basePath: string = '';

  constructor() {
    this.id = uuidv4() as ConnectorId;
    this.name = 'File System Connector';
    this.type = 'filesystem';
    this.version = '1.0.0';
  }

  async initialize(config: Record<string, any>): Promise<void> {
    this.basePath = config.basePath || process.cwd();
  }

  async execute(capability: string, parameters: Record<string, any>): Promise<any> {
    switch (capability) {
      case 'read_file':
        return this.readFile(parameters.path);
      case 'write_file':
        return this.writeFile(parameters.path, parameters.content);
      case 'list_directory':
        return this.listDirectory(parameters.path);
      case 'delete_file':
        return this.deleteFile(parameters.path);
      case 'create_directory':
        return this.createDirectory(parameters.path);
      case 'file_exists':
        return this.fileExists(parameters.path);
      case 'get_file_info':
        return this.getFileInfo(parameters.path);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }

  getCapabilities(): ConnectorCapability[] {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            description: 'Path to the file',
          },
        ],
        returns: 'string',
      },
      {
        name: 'write_file',
        description: 'Write content to a file',
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            description: 'Path to the file',
          },
          {
            name: 'content',
            type: 'string',
            required: true,
            description: 'Content to write',
          },
        ],
        returns: 'boolean',
      },
      {
        name: 'list_directory',
        description: 'List contents of a directory',
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            description: 'Path to the directory',
          },
        ],
        returns: 'array',
      },
      {
        name: 'delete_file',
        description: 'Delete a file',
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            description: 'Path to the file',
          },
        ],
        returns: 'boolean',
      },
      {
        name: 'create_directory',
        description: 'Create a directory',
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            description: 'Path to the directory',
          },
        ],
        returns: 'boolean',
      },
      {
        name: 'file_exists',
        description: 'Check if a file exists',
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            description: 'Path to check',
          },
        ],
        returns: 'boolean',
      },
      {
        name: 'get_file_info',
        description: 'Get file metadata',
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            description: 'Path to the file',
          },
        ],
        returns: 'object',
      },
    ];
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const startTime = Date.now();
    try {
      await fs.access(this.basePath);
      const latency = Date.now() - startTime;
      return {
        connectorId: this.id,
        status: 'healthy',
        lastCheck: new Date(),
        latency,
        errorRate: 0,
      };
    } catch (error) {
      return {
        connectorId: this.id,
        status: 'unhealthy',
        lastCheck: new Date(),
        latency: Date.now() - startTime,
        errorRate: 1,
      };
    }
  }

  async dispose(): Promise<void> {
    // No cleanup needed for file system connector
  }

  private async resolvePath(filePath: string): Promise<string> {
    return path.resolve(this.basePath, filePath);
  }

  private async readFile(filePath: string): Promise<string> {
    const resolvedPath = await this.resolvePath(filePath);
    return await fs.readFile(resolvedPath, 'utf-8');
  }

  private async writeFile(filePath: string, content: string): Promise<boolean> {
    const resolvedPath = await this.resolvePath(filePath);
    await fs.writeFile(resolvedPath, content, 'utf-8');
    return true;
  }

  private async listDirectory(dirPath: string): Promise<string[]> {
    const resolvedPath = await this.resolvePath(dirPath);
    return await fs.readdir(resolvedPath);
  }

  private async deleteFile(filePath: string): Promise<boolean> {
    const resolvedPath = await this.resolvePath(filePath);
    await fs.unlink(resolvedPath);
    return true;
  }

  private async createDirectory(dirPath: string): Promise<boolean> {
    const resolvedPath = await this.resolvePath(dirPath);
    await fs.mkdir(resolvedPath, { recursive: true });
    return true;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    const resolvedPath = await this.resolvePath(filePath);
    try {
      await fs.access(resolvedPath);
      return true;
    } catch {
      return false;
    }
  }

  private async getFileInfo(filePath: string): Promise<any> {
    const resolvedPath = await this.resolvePath(filePath);
    const stats = await fs.stat(resolvedPath);
    return {
      path: resolvedPath,
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      modified: stats.mtime,
      created: stats.birthtime,
    };
  }
}
