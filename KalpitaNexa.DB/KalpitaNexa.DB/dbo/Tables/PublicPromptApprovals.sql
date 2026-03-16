CREATE TABLE [dbo].[PublicPromptApprovals] (
    [ApprovalId]      UNIQUEIDENTIFIER DEFAULT (newid()) NOT NULL,
    [ChatId]          UNIQUEIDENTIFIER NOT NULL,
    [TenantId]        UNIQUEIDENTIFIER NOT NULL,
    [RequesterUserId] UNIQUEIDENTIFIER NOT NULL,
    [RequestDate]     DATETIME2 (7)    DEFAULT (getutcdate()) NOT NULL,
    [ApprovalStatus]  NVARCHAR (20)    DEFAULT ('Pending') NOT NULL,
    [ApproverUserId]  UNIQUEIDENTIFIER NULL,
    [ApprovalDate]    DATETIME2 (7)    NULL,
    [AdminComments]   NVARCHAR (500)   NULL,
    [IsActive]        BIT              DEFAULT ((1)) NOT NULL,
    PRIMARY KEY CLUSTERED ([ApprovalId] ASC),
    CONSTRAINT [CHK_ApprovalStatus] CHECK ([ApprovalStatus]='Rejected' OR [ApprovalStatus]='Approved' OR [ApprovalStatus]='Pending')
);




GO
CREATE NONCLUSTERED INDEX [IX_PublicPromptApprovals_ApprovalStatus_Pending]
    ON [dbo].[PublicPromptApprovals]([ApprovalStatus] ASC) WHERE ([ApprovalStatus]='Pending' AND [IsActive]=(1));


GO
CREATE NONCLUSTERED INDEX [IX_PublicPromptApprovals_ChatId]
    ON [dbo].[PublicPromptApprovals]([ChatId] ASC);

