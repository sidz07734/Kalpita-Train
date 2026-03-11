CREATE TABLE [dbo].[Tags] (
    [TagId]      UNIQUEIDENTIFIER DEFAULT (newid()) NOT NULL,
    [TenantId]   UNIQUEIDENTIFIER NOT NULL,
    [TagName]    NVARCHAR (50)    NOT NULL,
    [CreatedAt]  DATETIME2 (7)    DEFAULT (sysutcdatetime()) NOT NULL,
    [IsActive]   BIT              DEFAULT ((1)) NOT NULL,
    [CreatedOn]  DATETIME2 (7)    DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]  NVARCHAR (200)   DEFAULT ('system') NOT NULL,
    [ModifiedOn] DATETIME2 (7)    NULL,
    [ModifiedBy] NVARCHAR (200)   NULL,
    [ClientId]   NVARCHAR (255)   NULL,
    [AppId]      INT              DEFAULT ((0)) NOT NULL,
    PRIMARY KEY CLUSTERED ([TagId] ASC)
);


GO
CREATE NONCLUSTERED INDEX [IX_TagsNew_App]
    ON [dbo].[Tags]([AppId] ASC);

