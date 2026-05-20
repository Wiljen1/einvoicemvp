# SharePoint Folder Governance

The chatbot must only search documents from the client-approved SharePoint folder.

If live SharePoint access is not configured for local development, the chatbot may use the approved local mock folder. The mock folder is a development fallback and should contain only client-approved sample documents.

The chatbot must not browse the internet, search external websites, read arbitrary local folders, or answer from unsupported context.

Every supported answer should include confidence and source references. When the approved documents do not contain enough information, the chatbot should refuse with the configured fallback message.
