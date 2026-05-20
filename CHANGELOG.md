# Changelog

## Unreleased

- Added recursive local document indexing with max-depth, path-safety, symlink protection, and skipped-file reasons.
- Added text-based PDF extraction for local documents.
- Added document status and refresh endpoints for local reindexing without restart.
- Updated chat search and sources to use relative paths for nested files.
- Added Microsoft MSAL delegated sign-in for SharePoint access.
- Switched SharePoint file access to Microsoft Graph delegated user tokens.
- Removed the client-secret requirement from the MVP SharePoint settings UI.
- Added clearer status states for Microsoft sign-in, SharePoint connection, local documents, and access failures.
- Added documentation for local documents, MSAL setup, troubleshooting, and manual validation.
- Added tests for recursive indexing, PDF indexing, skipped files, MSAL/SharePoint status behavior, guardrails, chat refusal, and active document sources.
