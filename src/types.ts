export type DocumentType = 
  | 'article' 
  | 'book' 
  | 'chapter' 
  | 'thesis' 
  | 'conference' 
  | 'webpage';

export type ReadingStatus = 'to_read' | 'reading' | 'read';

export interface NoteEntry {
  id: string;
  text: string;
  page?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentInfo {
  name: string;
  size: number;
  mimeType: string;
  storagePath: string;
  uploadedAt: string;
  downloadUrl?: string;
}

export interface ReferenceItem {
  id: string;
  userId: string;
  type: DocumentType;
  title: string;
  subtitle?: string;
  authors?: string; // Comma or semicolon-separated names
  year?: string;
  publication?: string; // Journal or proceedings name
  publisher?: string; // For books
  place?: string; // City of publication
  volume?: string;
  number?: string;
  pages?: string;
  edition?: string;
  doi?: string;
  isbn?: string;
  url?: string;
  accessDate?: string;
  institution?: string; // For theses
  degree?: string; // Degree / degree program
  bookTitle?: string; // For chapters
  bookOrganizer?: string; // For chapters
  status: ReadingStatus;
  isFavorite: boolean;
  tags: string[];
  collectionIds: string[];
  notes?: string; // Legacy notes field (migrated to notesList)
  notesList?: NoteEntry[]; // Post-it Apontamentos
  abstract?: string; // Resumo original da fonte
  summary?: string;
  summarySource?: 'fulltext' | 'abstract';
  pageCount?: number;
  wordCount?: number;
  keyPoints?: string[];
  keywords?: string[];
  attachment?: AttachmentInfo;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  userId: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpenAlexWork {
  id: string;
  doi?: string;
  title: string;
  publication_year?: number;
  cited_by_count?: number;
  primary_location?: {
    source?: {
      display_name?: string;
    };
    landing_page_url?: string;
  };
  authorships?: Array<{
    author?: {
      display_name?: string;
    };
  }>;
}

export type SortOption = 'createdAt_desc' | 'createdAt_asc' | 'year_desc' | 'year_asc' | 'author_asc' | 'title_asc';
