CREATE TABLE [dbo].[TenantApplication] (
    [TenantId]    UNIQUEIDENTIFIER NOT NULL,
    [AppId]       INT              NOT NULL,
    [CreatedBy]   NVARCHAR (300)   NOT NULL,
    [CreatedDate] DATETIME         DEFAULT (getutcdate()) NOT NULL,
    CONSTRAINT [PK_tenantApp] PRIMARY KEY CLUSTERED ([TenantId] ASC, [AppId] ASC),
    CONSTRAINT [FK_tenantApp_Applications] FOREIGN KEY ([AppId]) REFERENCES [dbo].[Application] ([AppId]) ON DELETE CASCADE,
    CONSTRAINT [FK_tenantApp_Tenants] FOREIGN KEY ([TenantId]) REFERENCES [dbo].[Tenants] ([TenantId]) ON DELETE CASCADE
);

