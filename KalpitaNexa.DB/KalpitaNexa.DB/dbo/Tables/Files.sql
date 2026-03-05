CREATE TABLE [dbo].[Files] (
    [FileId]      UNIQUEIDENTIFIER DEFAULT (newid()) NOT NULL,
    [TenantId]    UNIQUEIDENTIFIER NOT NULL,
    [UserId]      UNIQUEIDENTIFIER NOT NULL,
    [FileName]    NVARCHAR (255)   NOT NULL,
    [FileType]    NVARCHAR (50)    NOT NULL,
    [FileSize]    INT              NULL,
    [UploadedAt]  DATETIME2 (7)    DEFAULT (sysutcdatetime()) NOT NULL,
    [FileContent] VARBINARY (MAX)  NULL,
    [IsActive]    BIT              DEFAULT ((1)) NOT NULL,
    [CreatedOn]   DATETIME2 (7)    DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]   NVARCHAR (200)   DEFAULT ('system') NOT NULL,
    [ModifiedOn]  DATETIME2 (7)    NULL,
    [ModifiedBy]  NVARCHAR (200)   NULL,
    [ClientId]    NVARCHAR (255)   NULL,
    [AppId]       INT              DEFAULT ((0)) NOT NULL,
    PRIMARY KEY CLUSTERED ([FileId] ASC)
);


GO
CREATE NONCLUSTERED INDEX [IX_FilesNew_App]
    ON [dbo].[Files]([TenantId] ASC, [AppId] ASC);

