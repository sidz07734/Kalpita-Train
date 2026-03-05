CREATE TABLE [dbo].[Roles] (
    [RoleId]     INT              IDENTITY (1, 1) NOT NULL,
    [RoleName]   NVARCHAR (200)   NOT NULL,
    [IsActive]   BIT              DEFAULT ((1)) NOT NULL,
    [CreatedOn]  DATETIME2 (7)    DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]  NVARCHAR (200)   NOT NULL,
    [ModifiedOn] DATETIME2 (7)    NULL,
    [ModifiedBy] NVARCHAR (200)   NULL,
    [TenantId]   UNIQUEIDENTIFIER NULL,
    [AppId]      INT              CONSTRAINT [DF_Roles_AppId] DEFAULT ((1)) NOT NULL,
    PRIMARY KEY CLUSTERED ([RoleId] ASC),
    CONSTRAINT [FK_Roles_Applications] FOREIGN KEY ([AppId]) REFERENCES [dbo].[Application] ([AppId])
);

