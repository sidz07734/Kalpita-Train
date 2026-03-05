CREATE TABLE [dbo].[ApplicationSettings] (
    [AppSettingsId]     INT            IDENTITY (1, 1) NOT NULL,
    [AppId]             INT            NOT NULL,
    [IsActive]          BIT            CONSTRAINT [DF_AppSettings_IsActive] DEFAULT ((1)) NOT NULL,
    [CreatedOn]         DATETIME2 (7)  CONSTRAINT [DF_AppSettings_CreatedOn] DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]         NVARCHAR (200) NOT NULL,
    [ModifiedOn]        DATETIME2 (7)  NULL,
    [ModifiedBy]        NVARCHAR (200) NULL,
    [MonthlyCredits]    INT            CONSTRAINT [[DF_AppSettings_MonthlyCredits]]] DEFAULT ((2)) NOT NULL,
    [TokensPerCredit]   INT            CONSTRAINT [DF_AppSettings_TokensPerCredit] DEFAULT ((2000)) NOT NULL,
    [ChatHistoryInDays] INT            DEFAULT ((360)) NOT NULL,
    [ConfidentialScore] DECIMAL (3, 2) CONSTRAINT [DF_AppSettings_ShowResultScore] DEFAULT ((0.9)) NULL,
    PRIMARY KEY CLUSTERED ([AppSettingsId] ASC),
    CONSTRAINT [FK_AppSettings_Applications] FOREIGN KEY ([AppId]) REFERENCES [dbo].[Application] ([AppId])
);

