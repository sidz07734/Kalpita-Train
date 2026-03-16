CREATE TABLE [dbo].[Chats] (
    [ChatId]                UNIQUEIDENTIFIER DEFAULT (newid()) NOT NULL,
    [TenantId]              UNIQUEIDENTIFIER NOT NULL,
    [UserId]                NVARCHAR (255)   NOT NULL,
    [Timestamp]             DATETIME2 (7)    DEFAULT (sysutcdatetime()) NOT NULL,
    [UserMessage]           NVARCHAR (MAX)   NOT NULL,
    [AIResponse]            NVARCHAR (MAX)   NOT NULL,
    [PromptTokens]          INT              NOT NULL,
    [ResponseTokens]        INT              NOT NULL,
    [TotalTokens]           AS               ([PromptTokens]+[ResponseTokens]) PERSISTED,
    [IsFavorited]           BIT              DEFAULT ((0)) NOT NULL,
    [IsFlagged]             BIT              DEFAULT ((0)) NOT NULL,
    [Visibility]            NVARCHAR (10)    DEFAULT ('private') NOT NULL,
    [IsDeleted]             BIT              DEFAULT ((0)) NOT NULL,
    [FileId]                UNIQUEIDENTIFIER NULL,
    [UpdatedAt]             DATETIME2 (7)    NULL,
    [UserFeedback]          INT              DEFAULT ((0)) NOT NULL,
    [IsActive]              BIT              DEFAULT ((1)) NOT NULL,
    [CreatedOn]             DATETIME2 (7)    DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]             NVARCHAR (200)   DEFAULT ('system') NOT NULL,
    [ModifiedOn]            DATETIME2 (7)    NULL,
    [ModifiedBy]            NVARCHAR (200)   NULL,
    [ClientId]              NVARCHAR (255)   NULL,
    [AppId]                 INT              DEFAULT ((0)) NOT NULL,
    [PublicApprovalStatus]  NVARCHAR (20)    CONSTRAINT [DF_Chats_PublicApprovalStatus] DEFAULT ('NotApplicable') NULL,
    [IsApproved]            BIT              CONSTRAINT [DF_Chats_IsApproved] DEFAULT ((0)) NULL,
    [PartitionYrMnthDayKey] AS               ((datepart(year,[CreatedOn])*(10000)+datepart(month,[CreatedOn])*(100))+datepart(day,[CreatedOn])) PERSISTED NOT NULL,
    CONSTRAINT [PK_Chats] PRIMARY KEY CLUSTERED ([ChatId] ASC, [PartitionYrMnthDayKey] ASC) ON [ps_CreatedYearMonthDay] ([PartitionYrMnthDayKey]),
    CONSTRAINT [UQ_Chats_ChatId] UNIQUE NONCLUSTERED ([ChatId] ASC, [PartitionYrMnthDayKey] ASC) ON [ps_CreatedYearMonthDay] ([PartitionYrMnthDayKey])
) ON [ps_CreatedYearMonthDay] ([PartitionYrMnthDayKey]);




GO
CREATE NONCLUSTERED INDEX [IX_Chats_Tenant_App]
    ON [dbo].[Chats]([TenantId] ASC, [AppId] ASC);

