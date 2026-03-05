CREATE TABLE [dbo].[UserApplication] (
    [UserApplicationId]     INT              IDENTITY (1, 1) NOT NULL,
    [UserId]                UNIQUEIDENTIFIER NOT NULL,
    [AppId]                 INT              NOT NULL,
    [CreatedOn]             DATETIME2 (7)    CONSTRAINT [DF_UserApp_CreatedOn] DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]             NVARCHAR (200)   NOT NULL,
    [RemainingCredits]      INT              CONSTRAINT [[DF_UserApp_RemainingCredits]]] DEFAULT ((2)) NOT NULL,
    [TokensPerCredit]       INT              CONSTRAINT [DF_UserApp_TokensPerCredit] DEFAULT ((2000)) NOT NULL,
    [ConsumedInputTokens]   BIGINT           CONSTRAINT [DF_UserApp_ConsumedInputTokens] DEFAULT ((0)) NOT NULL,
    [ConsumedOutputTokens]  BIGINT           CONSTRAINT [DF_UserApp_ConsumedOutputTokens] DEFAULT ((0)) NOT NULL,
    [ConsumedTokens]        AS               ([ConsumedInputTokens]+[ConsumedOutputTokens]),
    [DefaultLanguageId]     INT              NULL,
    [DefaultModelId]        INT              NULL,
    [AvailableTokens]       AS               (CONVERT([bigint],[RemainingCredits])*[TokensPerCredit]),
    [LastCreditRefreshDate] DATETIME2 (7)    NOT NULL,
    PRIMARY KEY CLUSTERED ([UserApplicationId] ASC),
    CONSTRAINT [FK_UserApp_DefaultLanguage] FOREIGN KEY ([DefaultLanguageId]) REFERENCES [dbo].[Languages] ([LanguageID]),
    CONSTRAINT [FK_UserApp_DefaultModel] FOREIGN KEY ([DefaultModelId]) REFERENCES [dbo].[Model] ([ModuleID]),
    CONSTRAINT [FK_UserApplications_Applications] FOREIGN KEY ([AppId]) REFERENCES [dbo].[Application] ([AppId]),
    CONSTRAINT [FK_UserApplications_Users] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users] ([UserId]),
    CONSTRAINT [UQ_UserApp_UserId_AppId] UNIQUE NONCLUSTERED ([UserId] ASC, [AppId] ASC)
);

