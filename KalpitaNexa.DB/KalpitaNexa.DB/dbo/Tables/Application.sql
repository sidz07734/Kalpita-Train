CREATE TABLE [dbo].[Application] (
    [AppId]           INT              IDENTITY (1, 1) NOT NULL,
    [TenantId]        UNIQUEIDENTIFIER NOT NULL,
    [ClientId]        NVARCHAR (200)   NOT NULL,
    [ApplicationName] NVARCHAR (200)   NOT NULL,
    [IsActive]        BIT              DEFAULT ((1)) NOT NULL,
    [CreatedOn]       DATETIME2 (7)    DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]       NVARCHAR (200)   NOT NULL,
    [ModifiedOn]      DATETIME2 (7)    NULL,
    [ModifiedBy]      NVARCHAR (200)   NULL,
    PRIMARY KEY CLUSTERED ([AppId] ASC),
    UNIQUE NONCLUSTERED ([ClientId] ASC)
);

