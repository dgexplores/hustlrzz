"""Data layer backed by Supabase (Postgres).

This module was migrated from Cloud Firestore to Supabase Postgres. The
public method surface (names, signatures, return shapes) is deliberately
kept identical so callers in routes, agents, coordinator and tests are
unaffected. Only the storage engine changed.

Row-Level Security policies are defined in supabase_schema.sql. The backend
connects with the service-role key, which bypasses RLS (server-side auth is
enforced by verify_token); RLS protects the data in case client keys leak.

The shared instance keeps the historical name ``firestore_db`` to minimize
churn across the codebase.
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from pydantic import HttpUrl, EmailStr

from backend.data.schemas import (
    Profile, Interview, Workflow, Feedback,
    PersonalExperience, RecommendedQA, GeneralBQ, CodingProblems
)
from backend.tools.supabase_config import supabase


class SupabaseDB:
    def __init__(self, client):
        """Initialize the Supabase Postgres client."""
        self.supabase = client

    # --- Profile Operations ---
    def create_or_update_profile(self, user_id: str, profile_data: Profile) -> Dict[str, str]:
        """Create or update profile fields in the users table."""
        if not profile_data.createAt:
            profile_data.createAt = datetime.now(timezone.utc)

        profile_dict = profile_data.model_dump(exclude_unset=True)
        for key, value in profile_dict.items():
            if isinstance(value, (HttpUrl, EmailStr)):
                profile_dict[key] = str(value)

        profile_dict["user_id"] = user_id
        self.supabase.table("users").upsert(
            profile_dict, on_conflict="user_id"
        ).execute()
        profile_dict.pop("user_id", None)

        return {
            "message": f"Profile for user {user_id} created/updated successfully",
            "data": profile_dict
        }

    def get_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        rows = (
            self.supabase.table("users")
            .select("*")
            .eq("user_id", user_id)
            .execute()
            .data
        )
        if rows:
            return {
                "message": f"Profile for user {user_id} retrieved successfully",
                "data": rows[0]
            }
        return {
            "message": f"Profile for user {user_id} not found",
            "data": None
        }

    def delete_profile(self, user_id: str) -> Dict[str, str]:
        """Clear profile fields (set to NULL)."""
        self.supabase.table("users").update({
            "name": None,
            "email": None,
            "photoURL": None,
            "linkedinLink": None,
            "githubLink": None,
            "portfolioLink": None,
            "additionalInfo": None,
            "createAt": None,
        }).eq("user_id", user_id).execute()
        return {
            "message": f"Profile fields for user {user_id} deleted successfully",
            "data": None
        }

    def delete_user(self, user_id: str) -> Dict[str, str]:
        """Delete the user row; workflows/interviews cascade via FK."""
        self.supabase.table("users").delete().eq("user_id", user_id).execute()
        return {
            "message": f"User {user_id} and all related data deleted successfully",
            "data": None
        }

    # --- Interview Operations ---
    def create_interview(self, user_id: str, session_id: str, workflow_id: str, interview_data: Interview) -> Dict[str, str]:
        """Create a new interview record with a unique interviewId."""
        if not interview_data.createAt:
            interview_data.createAt = datetime.now(timezone.utc)
        payload = interview_data.model_dump()
        self.supabase.table("interviews").upsert({
            "id": session_id,
            "user_id": user_id,
            "workflow_id": workflow_id,
            "transcript": payload.get("transcript"),
            "duration_minutes": payload.get("duration_minutes"),
            "feedback": payload.get("feedback"),
            "createAt": payload.get("createAt"),
        }, on_conflict="id").execute()
        return {
            "message": f"Interview {session_id} successfully created for user {user_id}",
            "data": None
        }

    def get_interview(self, user_id: str, workflow_id: str, interview_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve an interview record."""
        rows = (
            self.supabase.table("interviews")
            .select("*")
            .eq("id", interview_id)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        if rows:
            return {
                "message": f"Interview {interview_id} retrieved successfully",
                "data": rows[0]
            }
        return {
            "message": f"Interview {interview_id} not found",
            "data": None
        }

    def get_interviews_for_workflow(self, user_id: str, workflow_id: str) -> List[Dict[str, Any]]:
        """Get all interview session data under a specific workflow for a user."""
        rows = (
            self.supabase.table("interviews")
            .select("*")
            .eq("user_id", user_id)
            .eq("workflow_id", workflow_id)
            .execute()
            .data
        )
        results = []
        for row in rows:
            data = dict(row)
            data["interviewId"] = row.get("id")
            results.append(data)

        return {
            "message": f"Found {len(results)} interview(s) for workflow {workflow_id} successfully",
            "data": results
        }

    def delete_interview(self, user_id: str, workflow_id: str, interview_id: str) -> Dict[str, str]:
        """Delete an interview record."""
        self.supabase.table("interviews").delete().eq("id", interview_id).eq("user_id", user_id).execute()
        return {
            "message": f"Interview {interview_id} for user {user_id} deleted successfully",
            "data": None
        }

    # --- Workflow Operations ---
    def create_or_update_workflow(self, user_id: str, session_id: str, workflow_data: Workflow) -> Dict[str, str]:
        if not workflow_data.createAt:
            workflow_data.createAt = datetime.now(timezone.utc)
        payload = workflow_data.model_dump(exclude={"personalExperience", "recommendedQAs"})
        self.supabase.table("workflows").upsert({
            "id": session_id,
            "user_id": user_id,
            "title": payload.get("title"),
            "createAt": payload.get("createAt"),
        }, on_conflict="id").execute()

        return {
            "message": f"Workflow {session_id} successfully created/update for user {user_id}",
            "data": None
        }

    def get_workflow(self, user_id: str, workflow_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a workflow record."""
        rows = (
            self.supabase.table("workflows")
            .select("*")
            .eq("id", workflow_id)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        if rows:
            return {
                "message": f"Workflow {workflow_id} retrieved successfully for user {user_id}",
                "data": rows[0]
            }
        return {
            "message": f"Workflow {workflow_id} not found for user {user_id}",
            "data": None
        }

    def delete_workflow(self, user_id: str, workflow_id: str) -> Dict[str, str]:
        """Delete a workflow record (interviews cascade via FK)."""
        self.supabase.table("workflows").delete().eq("id", workflow_id).eq("user_id", user_id).execute()
        return {
            "message": f"Workflow {workflow_id} for user {user_id} deleted successfully",
            "data": None
        }

    def get_workflows_for_user(self, user_id: str) -> List[Dict[str, str]]:
        """Get a list of workflow summaries (workflow_id and title) for a user."""
        rows = (
            self.supabase.table("workflows")
            .select("*")
            .eq("user_id", user_id)
            .execute()
            .data
        )
        result = []
        for row in rows:
            data = dict(row)
            data["workflowId"] = row.get("id")
            result.append(data)

        return {
            "message": f"Found {len(result)} workflows found for user {user_id} successfully",
            "data": result
        }

    # --- Personal Experience in Workflow ---
    def set_personal_experience(self, user_id: str, workflow_id: str, experience: PersonalExperience) -> Dict[str, str]:
        self.supabase.table("workflows").update({
            "personalExperience": experience.model_dump()
        }).eq("id", workflow_id).eq("user_id", user_id).execute()
        return {
            "message": f"Personal experience for user {user_id}, workflow {workflow_id} set successfully",
            "data": None
        }

    def get_personal_experience(self, user_id: str, workflow_id: str) -> Optional[Dict[str, Any]]:
        rows = (
            self.supabase.table("workflows")
            .select("personalExperience")
            .eq("id", workflow_id)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        if rows and rows[0].get("personalExperience") is not None:
            return {
                "message": f"Personal experience for user {user_id}, workflow {workflow_id} retrieved successfully",
                "data": rows[0].get("personalExperience")
            }
        return {
            "message": f"Personal experience not found for user {user_id}, workflow {workflow_id}",
            "data": None
        }

    # --- Recommended QAs in Workflow ---
    def set_recommended_qas(self, user_id: str, workflow_id: str, qas: List[RecommendedQA]) -> Dict[str, str]:
        self.supabase.table("workflows").update({
            "recommendedQAs": [qa.model_dump() for qa in qas]
        }).eq("id", workflow_id).eq("user_id", user_id).execute()
        return {
            "message": f"Recommended QAs for user {user_id}, workflow {workflow_id} set successfully",
            "data": None
        }

    def get_recommended_qas(self, user_id: str, workflow_id: str) -> Optional[List[Dict[str, Any]]]:
        rows = (
            self.supabase.table("workflows")
            .select("recommendedQAs")
            .eq("id", workflow_id)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        if rows and rows[0].get("recommendedQAs") is not None:
            return {
                "message": f"Recommended QAs retrieved for user {user_id}, workflow {workflow_id} successfully",
                "data": rows[0].get("recommendedQAs")
            }
        return {
            "message": f"Recommended QAs not found for user {user_id}, workflow {workflow_id}",
            "data": None
        }

    # --- Transcript Operations ---
    def get_transcript(self, user_id: str, workflow_id: str, interview_id: str) -> Optional[List[Dict[str, Any]]]:
        """Retrieve transcript of an interview."""
        rows = (
            self.supabase.table("interviews")
            .select("transcript")
            .eq("id", interview_id)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        if rows and rows[0].get("transcript") is not None:
            return {
                "message": f"Transcript retrieved for interview {interview_id} successfully",
                "data": rows[0].get("transcript")
            }
        return {
            "message": f"Transcript not found for interview {interview_id}",
            "data": None
        }

    # --- Feedback Operations ---
    def set_feedback(self, user_id: str, workflow_id: str, interview_id: str, feedback: Feedback) -> Dict[str, str]:
        self.supabase.table("interviews").update({
            "feedback": feedback.model_dump()
        }).eq("id", interview_id).eq("user_id", user_id).execute()
        return {
            "message": f"Feedback set for interview {interview_id} successfully",
            "data": None
        }

    def get_feedback(self, user_id: str, workflow_id: str, interview_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve feedback of an interview."""
        rows = (
            self.supabase.table("interviews")
            .select("feedback")
            .eq("id", interview_id)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        if rows and rows[0].get("feedback") is not None:
            return {
                "message": f"Feedback retrieved for interview {interview_id} successfully",
                "data": rows[0].get("feedback")
            }
        return {
            "message": f"Feedback not found for interview {interview_id}",
            "data": None
        }

    # --- General Behavioral Questions Operations ---
    def set_general_bqs(self, bqs: List[GeneralBQ]) -> Dict[str, str]:
        """Set general behavioral questions (upsert by id)."""
        rows = [
            {
                "id": bq.id,
                "question": bq.question,
                "category": bq.category,
                "tags": bq.tags,
            }
            for bq in bqs
        ]
        self.supabase.table("bqs").upsert(rows, on_conflict="id").execute()
        return {
            "message": "General behavioral questions set successfully",
            "data": None
        }

    def get_general_bqs(self) -> Optional[List[Dict[str, Any]]]:
        """Retrieve general behavioral questions."""
        rows = self.supabase.table("bqs").select("*").execute().data
        if not rows:
            return {
                "message": "Behavioral questions not found",
                "data": None
            }
        return {
            "message": "Behavioral questions retrieved successfully",
            "data": rows
        }

    def delete_general_bqs(self) -> Dict[str, str]:
        """Delete system data (general questions)."""
        rows = self.supabase.table("bqs").select("id").execute().data
        deleted_count = len(rows)
        if deleted_count:
            self.supabase.table("bqs").delete().neq("id", "__none__").execute()
        return {
            "message": f"Deleted {deleted_count} behavioral questions from 'bqs' table successfully",
            "data": None
        }

    # --- Coding Problems Operations ---
    def set_coding_problems(self, problems: List[CodingProblems]) -> Dict[str, str]:
        """Set coding problems (upsert by id)."""
        rows = [
            dict(p.model_dump(), **{"id": str(p.id)})
            for p in problems
        ]
        BATCH_SIZE = 500
        written = 0
        batches = 0
        for start in range(0, len(rows), BATCH_SIZE):
            self.supabase.table("problems").upsert(
                rows[start:start + BATCH_SIZE], on_conflict="id"
            ).execute()
            written += len(rows[start:start + BATCH_SIZE])
            batches += 1

        return {
            "message": "Coding problems written",
            "written": written,
            "batches": batches,
        }

    def get_coding_problems(self, problem_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single coding problem by ID."""
        rows = (
            self.supabase.table("problems")
            .select("*")
            .eq("id", problem_id)
            .execute()
            .data
        )
        if not rows:
            return {
                "message": f"Coding problem with id {problem_id} not found",
                "data": None
            }
        return {
            "message": "Coding problem retrieved successfully",
            "data": rows[0]
        }

    def delete_coding_problems(self) -> Dict[str, str]:
        """Delete system data (coding problems)."""
        rows = self.supabase.table("problems").select("id").execute().data
        deleted_count = len(rows)
        if deleted_count:
            self.supabase.table("problems").delete().neq("id", "__none__").execute()
        return {
            "message": f"Deleted {deleted_count} coding problems from 'problems' table successfully",
            "data": None
        }


# Create shared SupabaseDB instance (name preserved for compatibility)
firestore_db = SupabaseDB(supabase)
