CREATE TABLE [dbo].[TenantFeatureMapping] (
    [TenantFeatureMappingId] INT              IDENTITY (1, 1) NOT NULL,
    [TenantId]               UNIQUEIDENTIFIER NOT NULL,
    [FeatureId]              INT              NOT NULL,
    [IsActive]               BIT              DEFAULT ((1)) NOT NULL,
    [CreatedOn]              DATETIME2 (7)    DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]              NVARCHAR (200)   NOT NULL,
    [ModifiedOn]             DATETIME2 (7)    NULL,
    [ModifiedBy]             NVARCHAR (200)   NULL,
    [AppId]                  INT              CONSTRAINT [DF_TenantFeatureMapping_AppId] DEFAULT ((1)) NOT NULL,
    PRIMARY KEY CLUSTERED ([TenantFeatureMappingId] ASC),
    FOREIGN KEY ([FeatureId]) REFERENCES [dbo].[Features] ([FeatureId]),
    FOREIGN KEY ([TenantId]) REFERENCES [dbo].[Tenants] ([TenantId]),
    CONSTRAINT [FK_TenantFeatureMapping_Applications] FOREIGN KEY ([AppId]) REFERENCES [dbo].[Application] ([AppId])
);

