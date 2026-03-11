CREATE TABLE [dbo].[ChatTags] (
    [ChatTagId]  INT              IDENTITY (1, 1) NOT NULL,
    [ChatId]     UNIQUEIDENTIFIER NOT NULL,
    [TagId]      UNIQUEIDENTIFIER NOT NULL,
    [IsActive]   BIT              DEFAULT ((1)) NOT NULL,
    [CreatedOn]  DATETIME2 (7)    DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]  NVARCHAR (200)   DEFAULT ('system') NOT NULL,
    [ModifiedOn] DATETIME2 (7)    NULL,
    [ModifiedBy] NVARCHAR (200)   NULL,
    [ClientId]   NVARCHAR (255)   NULL,
    [AppId]      INT              DEFAULT ((0)) NOT NULL,
    PRIMARY KEY CLUSTERED ([ChatTagId] ASC)
);


GO
CREATE NONCLUSTERED INDEX [IX_ChatTags_App]
    ON [dbo].[ChatTags]([AppId] ASC);

