CREATE TABLE [dbo].[RoleFeatures] (
    [RoleFeatureId] INT            IDENTITY (1, 1) NOT NULL,
    [RoleId]        INT            NOT NULL,
    [FeatureId]     INT            NOT NULL,
    [IsActive]      BIT            DEFAULT ((1)) NOT NULL,
    [CreatedOn]     DATETIME2 (7)  DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]     NVARCHAR (200) NOT NULL,
    [ModifiedOn]    DATETIME2 (7)  NULL,
    [ModifiedBy]    NVARCHAR (200) NULL,
    [AppId]         INT            CONSTRAINT [DF_RoleFeatures_AppId] DEFAULT ((1)) NOT NULL,
    PRIMARY KEY CLUSTERED ([RoleFeatureId] ASC),
    CONSTRAINT [FK_RoleFeatures_Applications] FOREIGN KEY ([AppId]) REFERENCES [dbo].[Application] ([AppId])
);

