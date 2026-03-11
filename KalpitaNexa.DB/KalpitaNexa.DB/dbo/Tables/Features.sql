CREATE TABLE [dbo].[Features] (
    [FeatureId]   INT            IDENTITY (1, 1) NOT NULL,
    [FeatureName] NVARCHAR (200) NOT NULL,
    [IsActive]    BIT            NOT NULL,
    [CreatedOn]   DATETIME2 (7)  NOT NULL,
    [CreatedBy]   NVARCHAR (200) NOT NULL,
    [ModifiedOn]  DATETIME2 (7)  NULL,
    [ModifiedBy]  NVARCHAR (200) NULL,
    PRIMARY KEY CLUSTERED ([FeatureId] ASC)
);

