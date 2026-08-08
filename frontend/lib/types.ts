export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface Metrics {
  handDetectionCounter: number;
  handDetectionDuration: number;
  notFacingCounter: number;
  notFacingDuration: number;
  badPostureDetectionCounter: number;
  badPostureDuration: number;
}

export interface Question {
  type: string;
  question: string;
  tests?: string;
  difficulty?: number;
  answer_hint?: string;
  follow_up?: string;
  tags?: string[];
}

export interface CompanyMatch {
  matched_skills: string[];
  gap_skills: string[];
  resume_weaknesses: string[];
  overall_match_percent: number;
  summary: string;
}

export interface Workflow {
  workflow_id: string;
  title?: string;
  company?: string;
  questions: Question[];
  answers: { question?: string; answer?: string; tags?: string[] }[];
  match?: CompanyMatch;
  created_at?: string;
}

export interface InterviewCardMessage {
  type: string;
  data?: any;
}

export interface AppSettings {
  role: string;
  company: string;
}