CREATE TABLE [dbo].[ApplicationConfigurations] (
    [AppConfigurationId] INT            IDENTITY (1, 1) NOT NULL,
    [AppId]              INT            NOT NULL,
    [IsActive]           BIT            DEFAULT ((1)) NOT NULL,
    [CreatedOn]          DATETIME2 (7)  DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]          NVARCHAR (200) NOT NULL,
    [ModifiedOn]         DATETIME2 (7)  NULL,
    [ModifiedBy]         NVARCHAR (200) NULL,
    PRIMARY KEY CLUSTERED ([AppConfigurationId] ASC)
);

