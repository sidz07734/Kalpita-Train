CREATE TABLE [dbo].[UserSettings] (
    [UserID]              UNIQUEIDENTIFIER NOT NULL,
    [AppID]               INT              NOT NULL,
    [DefaultLanguageID]   INT              NULL,
    [DefaultModelID]      INT              NULL,
    [DefaultDataSourceID] INT              NULL,
    [IsDarkMode]          BIT              DEFAULT ((0)) NOT NULL,
    [CreatedOn]           DATETIME2 (7)    DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]           NVARCHAR (200)   NOT NULL,
    [ModifiedOn]          DATETIME2 (7)    NULL,
    [ModifiedBy]          NVARCHAR (200)   NULL,
    PRIMARY KEY CLUSTERED ([UserID] ASC, [AppID] ASC),
    CONSTRAINT [FK_UserSettings_Languages] FOREIGN KEY ([DefaultLanguageID]) REFERENCES [dbo].[Languages] ([LanguageID]),
    CONSTRAINT [FK_UserSettings_Model] FOREIGN KEY ([DefaultModelID]) REFERENCES [dbo].[Model] ([ModuleID]),
    CONSTRAINT [FK_UserSettings_Users] FOREIGN KEY ([UserID]) REFERENCES [dbo].[Users] ([UserId])
);

