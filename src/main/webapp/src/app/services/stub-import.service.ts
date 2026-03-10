import {Injectable} from '@angular/core';
import JSZip from 'jszip';

export interface ProcessedStub {
  stub: any;
  hasSubstitutedFile: boolean;
  originalFileName?: string;
}

export interface ImportResult {
  mappings: ProcessedStub[];
  warnings: string[];
  errors: string[];
  totalFiles: number;
  substitutedFiles: number;
}

export interface ValidationError {
  type: 'size' | 'structure' | 'missing_file' | 'invalid_json' | 'invalid_stub';
  message: string;
  details?: string[];
}

export interface ZipFileEntry {
  path: string;
  name: string;
  type: 'mapping' | 'bodyFile';
  size: number;
  selected: boolean;
  zipObject: JSZip.JSZipObject;
}

export interface ZipStructure {
  mappingFiles: ZipFileEntry[];
  bodyFiles: ZipFileEntry[];
  zipInstance: JSZip;
}

@Injectable({
  providedIn: 'root'
})
export class StubImportService {
  private readonly MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 Mo

  constructor() {}

  /**
   * Charge la structure du ZIP et retourne les fichiers disponibles
   * for user selection
   */
  async loadZipStructure(file: File): Promise<ZipStructure> {
    // Size validation
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size of 20 MB (current: ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    }

    try {
      // Load the ZIP
      const zip = await JSZip.loadAsync(file);

      const mappingFiles: ZipFileEntry[] = [];
      const bodyFiles: ZipFileEntry[] = [];

      // List all files
      Object.keys(zip.files).forEach(path => {
        const zipFile = zip.files[path];

        // Ignore directories
        if (zipFile.dir) {
          return;
        }

        // Fichiers de mapping
        if (path.match(/^mappings\/.*\.json$/i)) {
          const name = path.replace(/^mappings\//, '');
          mappingFiles.push({
            path,
            name,
            type: 'mapping',
            size: 0,
            selected: true,
            zipObject: zipFile
          });
        }
        // Fichiers de body
        else if (path.match(/^__files\//i)) {
          const name = path.replace(/^__files\//, '');
          bodyFiles.push({
            path,
            name,
            type: 'bodyFile',
            size: 0,
            selected: true,
            zipObject: zipFile
          });
        }
      });

      // Structure validation
      if (mappingFiles.length === 0) {
        throw new Error('No mapping files found. Expected structure: mappings/*.json');
      }

      return {
        mappingFiles,
        bodyFiles,
        zipInstance: zip
      };

    } catch (err: any) {
      throw new Error(`Failed to read ZIP file: ${err.message}`);
    }
  }

  /**
   * Processes the selected files in the ZIP
   */
  async processSelectedFiles(
    structure: ZipStructure,
    selectedMappingPaths: string[],
    selectedBodyFilePaths: string[]
  ): Promise<ImportResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const processedStubs: ProcessedStub[] = [];
    let totalFiles = selectedBodyFilePaths.length;
    let substitutedFiles = 0;

    try {
      // Create a map of selected body files
      const bodyFilesMap = new Map<string, JSZip.JSZipObject>();
      structure.bodyFiles.forEach(bf => {
        if (selectedBodyFilePaths.includes(bf.path)) {
          bodyFilesMap.set(bf.name, bf.zipObject);
        }
      });

      // Process each selected mapping file
      for (const mappingPath of selectedMappingPaths) {
        const mappingEntry = structure.mappingFiles.find(m => m.path === mappingPath);
        if (!mappingEntry) {
          continue;
        }

        try {
          const content = await mappingEntry.zipObject.async('string');

          // Clean up comments
          const cleanedContent = this.stripJsonComments(content);

          // Attempt to parse with detailed error handling
          let parsedData;
          try {
            parsedData = JSON.parse(cleanedContent);
          } catch (parseErr: any) {
            errors.push(`❌ Failed to parse ${mappingEntry.name}: ${parseErr.message}`);
            continue;
          }

          // Detect format: object with mappings[] or direct stub
          let stubsToProcess: any[] = [];

          if (parsedData.mappings && Array.isArray(parsedData.mappings)) {
            // Format WireMock : {mappings: [...]}
            stubsToProcess = parsedData.mappings;
          } else if (parsedData.request && parsedData.response) {
            // Format stub unique
            stubsToProcess = [parsedData];
          } else {
            errors.push(`Invalid format in ${mappingEntry.name}: missing mappings[] or request/response`);
            continue;
          }

          // Traiter chaque stub
          for (let i = 0; i < stubsToProcess.length; i++) {
            const stub = stubsToProcess[i];
            const stubLabel = stubsToProcess.length > 1 ? `${mappingEntry.name}[${i}]` : mappingEntry.name;

            // Validate the stub structure
            if (!stub.request || !stub.response) {
              errors.push(`Invalid stub in ${stubLabel}: missing request or response`);
              continue;
            }

            // Check if the stub references a bodyFileName
            const bodyFileName = stub.response?.bodyFileName;

            if (bodyFileName) {
              const bodyFile = bodyFilesMap.get(bodyFileName);

              if (bodyFile) {
                // Substitute the file content
                stub.response.body = await bodyFile.async('string');
                delete stub.response.bodyFileName;

                // Add metadata for traceability
                if (!stub.metadata) {
                  stub.metadata = {};
                }
                stub.metadata.originalBodyFileName = bodyFileName;

                processedStubs.push({
                  stub,
                  hasSubstitutedFile: true,
                  originalFileName: bodyFileName
                });

                substitutedFiles++;
              } else {
                // Body file not selected or missing
                if (selectedBodyFilePaths.length > 0) {
                  warnings.push(`Body file not selected: ${bodyFileName} (referenced in ${stubLabel})`);
                } else {
                  errors.push(`Missing body file: ${bodyFileName} (referenced in ${stubLabel})`);
                }

                // Add the stub anyway without substitution
                processedStubs.push({
                  stub,
                  hasSubstitutedFile: false
                });
              }
            } else {
              // Stub sans bodyFileName
              processedStubs.push({
                stub,
                hasSubstitutedFile: false
              });
            }
          }

        } catch (err: any) {
          errors.push(`Failed to process ${mappingEntry.name}: ${err.message}`);
        }
      }

      // Check selected body files not referenced
      const referencedFiles = new Set(
        processedStubs
          .filter(p => p.originalFileName)
          .map(p => p.originalFileName!)
      );

      structure.bodyFiles.forEach(bf => {
        if (selectedBodyFilePaths.includes(bf.path) && !referencedFiles.has(bf.name)) {
          warnings.push(`Unused body file: ${bf.name}`);
        }
      });

      return {
        mappings: processedStubs,
        warnings,
        errors,
        totalFiles,
        substitutedFiles
      };

    } catch (err: any) {
      throw new Error(`Failed to process selected files: ${err.message}`);
    }
  }

  /**
   * Processes a ZIP file containing WireMock stubs (automatic full version)
   * Structure attendue:
   * - mappings/*.json (stubs)
   * - __files/* (response files)
   */
  async processZipImport(file: File): Promise<ImportResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const processedStubs: ProcessedStub[] = [];
    let totalFiles = 0;
    let substitutedFiles = 0;

    // Size validation
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size of 20 MB (current: ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    }

    try {
      // Load the ZIP
      const zip = await JSZip.loadAsync(file);

      // List files
      const mappingFiles: string[] = [];
      const bodyFiles = new Map<string, JSZip.JSZipObject>();

      Object.keys(zip.files).forEach(path => {
        const file = zip.files[path];

        // Ignore directories
        if (file.dir) {
          return;
        }

        // Fichiers de mapping
        if (path.match(/^mappings\/.*\.json$/i)) {
          mappingFiles.push(path);
        }
        // Fichiers de body
        else if (path.match(/^__files\//i)) {
          const relativePath = path.replace(/^__files\//, '');
          bodyFiles.set(relativePath, file);
          totalFiles++;
        }
      });

      // Structure validation
      if (mappingFiles.length === 0) {
        errors.push('No mapping files found. Expected structure: mappings/*.json');
      }

      if (bodyFiles.size === 0) {
        warnings.push('No body files found in __files/ directory');
      }

      // Traiter chaque fichier de mapping
      for (const mappingPath of mappingFiles) {
        try {
          const content = await zip.files[mappingPath].async('string');
          const cleanedContent = this.stripJsonComments(content);
          const stub = JSON.parse(cleanedContent);

          // Validate the stub structure
          if (!stub.request || !stub.response) {
            errors.push(`Invalid stub in ${mappingPath}: missing request or response`);
            continue;
          }

          // Check if the stub references a bodyFileName
          const bodyFileName = stub.response?.bodyFileName;

          if (bodyFileName) {
            const bodyFile = bodyFiles.get(bodyFileName);

            if (bodyFile) {
              // Substitute the file content
              stub.response.body = await bodyFile.async('string');
              delete stub.response.bodyFileName;

              // Add metadata for traceability
              if (!stub.metadata) {
                stub.metadata = {};
              }
              stub.metadata.originalBodyFileName = bodyFileName;

              processedStubs.push({
                stub,
                hasSubstitutedFile: true,
                originalFileName: bodyFileName
              });

              substitutedFiles++;
            } else {
              errors.push(`Missing body file: ${bodyFileName} (referenced in ${mappingPath})`);

              // Add the stub anyway without substitution
              processedStubs.push({
                stub,
                hasSubstitutedFile: false
              });
            }
          } else {
            // Stub sans bodyFileName
            processedStubs.push({
              stub,
              hasSubstitutedFile: false
            });
          }

        } catch (err: any) {
          errors.push(`Failed to process ${mappingPath}: ${err.message}`);
        }
      }

      // Check for orphan files
      const referencedFiles = new Set(
        processedStubs
          .filter(p => p.originalFileName)
          .map(p => p.originalFileName!)
      );

      bodyFiles.forEach((_, filename) => {
        if (!referencedFiles.has(filename)) {
          warnings.push(`Unused body file: ${filename}`);
        }
      });

      return {
        mappings: processedStubs,
        warnings,
        errors,
        totalFiles,
        substitutedFiles
      };

    } catch (err: any) {
      throw new Error(`Failed to process ZIP file: ${err.message}`);
    }
  }

  /**
   * Supprime les commentaires JSONC (JSON avec commentaires)
   * Improvement: better handling of edge cases, escaping and trailing commas
   */
  private stripJsonComments(jsonString: string): string {
    // Step 1: Remove /* ... */ comments
    let result = jsonString.replace(/\/\*[\s\S]*?\*\//g, '');

    // Step 2: Remove // comments line by line
    const lines = result.split('\n');
    const cleanedLines = lines.map((line) => {
      // Find if there is a // comment outside a string
      let inString = false;
      let stringChar = '';
      let escaped = false;
      let commentStart = -1;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        // Handle escaping
        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === '\\' && inString) {
          escaped = true;
          continue;
        }

        // Handle strings
        if ((char === '"' || char === "'") && !escaped) {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (char === stringChar) {
            inString = false;
            stringChar = '';
          }
        }

        // Detect // outside a string
        if (!inString && char === '/' && i + 1 < line.length && line[i + 1] === '/') {
          commentStart = i;
          break;
        }
      }

      if (commentStart >= 0) {
        return line.substring(0, commentStart).trimEnd();
      }

      return line;
    });

    result = cleanedLines.join('\n');

    // Step 3: Clean up trailing commas
    result = result.replace(/,(\s*[\]}])/g, '$1');

    // Step 4: Remove multiple blank lines
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

    return result;
  }

  /**
   * Valide un fichier JSON standard (non-ZIP)
   */
  validateJsonImport(content: string): { valid: boolean; error?: string; mappings?: any[] } {
    try {
      const parsed = JSON.parse(content);

      let mappings: any[] = [];
      if (Array.isArray(parsed)) {
        mappings = parsed;
      } else if (parsed.mappings && Array.isArray(parsed.mappings)) {
        mappings = parsed.mappings;
      } else {
        return {
          valid: false,
          error: 'Invalid file format. Expected array or {mappings: [...]}'
        };
      }

      // Valider chaque mapping
      const invalidMappings = mappings.filter(m => !m.request || !m.response);
      if (invalidMappings.length > 0) {
        return {
          valid: false,
          error: `Invalid mappings found: ${invalidMappings.length} mappings missing request or response`
        };
      }

      return {
        valid: true,
        mappings
      };

    } catch (err: any) {
      return {
        valid: false,
        error: 'Invalid JSON: ' + err.message
      };
    }
  }

  /**
   * Builds a ZipStructure from files selected via webkitdirectory
   * or a multiple file selection (Firefox fallback)
   */
  async loadDirectoryStructure(files: FileList): Promise<ZipStructure> {
    const mappingFiles: ZipFileEntry[] = [];
    const bodyFiles: ZipFileEntry[] = [];

    // Taille totale
    let totalSize = 0;
    for (let i = 0; i < files.length; i++) {
      totalSize += files[i].size;
    }
    if (totalSize > this.MAX_FILE_SIZE) {
      throw new Error(`Total size exceeds maximum allowed size of 20 MB (current: ${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // webkitRelativePath = "wiremock/mappings/stub1.json" ou "mappings/stub1.json"
      const relativePath = (file as any).webkitRelativePath as string || file.name;

      // Normalize: keep only the part starting from mappings/ or __files/
      const normalizedPath = this.normalizePath(relativePath);

      if (!normalizedPath) {
        continue;
      }

      // Create a JSZipObject-like from the native File
      const zipObjectLike = this.fileToZipObjectLike(file);

      if (normalizedPath.match(/^mappings\/.*\.json$/i)) {
        const name = normalizedPath.replace(/^mappings\//, '');
        mappingFiles.push({
          path: normalizedPath,
          name,
          type: 'mapping',
          size: file.size,
          selected: true,
          zipObject: zipObjectLike
        });
      } else if (normalizedPath.match(/^__files\//i)) {
        const name = normalizedPath.replace(/^__files\//, '');
        bodyFiles.push({
          path: normalizedPath,
          name,
          type: 'bodyFile',
          size: file.size,
          selected: true,
          zipObject: zipObjectLike
        });
      }
    }

    if (mappingFiles.length === 0) {
      throw new Error('No mapping files found. Expected files under mappings/*.json');
    }

    return {
      mappingFiles,
      bodyFiles,
      zipInstance: null as any  // No JSZip instance for a directory
    };
  }

  /**
   * Normalise un chemin de fichier pour extraire la portion mappings/ ou __files/
   * Exemples :
   *   "wiremock/mappings/stub.json"   → "mappings/stub.json"
   *   "mappings/stub.json"            → "mappings/stub.json"
   *   "__files/response.xml"          → "__files/response.xml"
   *   "my-project/__files/body.json"  → "__files/body.json"
   */
  private normalizePath(fullPath: string): string | null {
    const mappingsMatch = fullPath.match(/(mappings\/.+\.json)$/i);
    if (mappingsMatch) {
      return mappingsMatch[1];
    }
    const filesMatch = fullPath.match(/(__files\/.+)$/i);
    if (filesMatch) {
      return filesMatch[1];
    }
    return null;
  }

  /**
   * Creates a JSZip.JSZipObject-compatible object from a native File.
   * Supporte les types 'string' et 'base64' pour les fichiers binaires.
   */
  private fileToZipObjectLike(file: File): any {
    return {
      async: (type: string) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
          if (type === 'base64') {
            reader.onload = (e) => {
              const dataUrl = e.target?.result as string;
              // dataUrl = "data:<mime>;base64,<data>"
              const base64 = dataUrl.split(',')[1] ?? '';
              resolve(base64);
            };
            reader.readAsDataURL(file);
          } else {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsText(file);
          }
        });
      },
      dir: false,
      name: file.name
    };
  }
}
