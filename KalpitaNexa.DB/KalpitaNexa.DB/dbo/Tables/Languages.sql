CREATE TABLE [dbo].[Languages] (
    [LanguageID]   INT            IDENTITY (1, 1) NOT NULL,
    [LanguageName] NVARCHAR (255) NOT NULL,
    [LanguageCode] NVARCHAR (10)  NULL,
    [CreatedOn]    DATETIME2 (7)  DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]    NVARCHAR (200) NOT NULL,
    [ModifiedOn]   DATETIME2 (7)  NULL,
    [ModifiedBy]   NVARCHAR (200) NULL,
    PRIMARY KEY CLUSTERED ([LanguageID] ASC)
);

