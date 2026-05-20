# Document Source Governance

The chatbot must only search documents from the active client-approved document source.

For SharePoint content, the current MVP uses a OneDrive-synced local folder chosen by the user. The local folder or manual upload source should contain only client-approved documents.

The chatbot must not browse the internet, search external websites, read arbitrary local folders, or answer from unsupported context.

Every supported answer should include confidence and source references. When the approved documents do not contain enough information, the chatbot should refuse with the configured fallback message.
