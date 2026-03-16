CREATE TABLE [dbo].[ApplicationLanguages] (
    [ApplicationLanguageId] INT            IDENTITY (1, 1) NOT NULL,
    [AppId]                 INT            NOT NULL,
    [LanguageId]            INT            NOT NULL,
    [IsDefault]             BIT            CONSTRAINT [DF_ApplicationLanguages_IsDefault] DEFAULT ((0)) NOT NULL,
    [IsActive]              BIT            CONSTRAINT [DF_ApplicationLanguages_IsActive] DEFAULT ((1)) NOT NULL,
    [CreatedOn]             DATETIME2 (7)  CONSTRAINT [DF_ApplicationLanguages_CreatedOn] DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]             NVARCHAR (200) NOT NULL,
    [ModifiedOn]            DATETIME2 (7)  NULL,
    [ModifiedBy]            NVARCHAR (200) NULL,
    PRIMARY KEY CLUSTERED ([ApplicationLanguageId] ASC),
    CONSTRAINT [FK_AppLang_App] FOREIGN KEY ([AppId]) REFERENCES [dbo].[Application] ([AppId]),
    CONSTRAINT [FK_AppLang_Language] FOREIGN KEY ([LanguageId]) REFERENCES [dbo].[Languages] ([LanguageID]),
    CONSTRAINT [UQ_AppLang_App_Lang] UNIQUE NONCLUSTERED ([AppId] ASC, [LanguageId] ASC)
);

