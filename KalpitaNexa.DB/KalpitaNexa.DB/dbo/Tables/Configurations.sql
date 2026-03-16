CREATE TABLE [dbo].[Configurations] (
    [ConfigurationId]   INT            IDENTITY (1, 1) NOT NULL,
    [AppId]             INT            NULL,
    [ConfigurationName] NVARCHAR (200) NOT NULL,
    [ConfigKey]         NVARCHAR (200) NOT NULL,
    [ConfigValue]       NVARCHAR (MAX) NOT NULL,
    [Category]          NVARCHAR (100) NOT NULL,
    [IsActive]          BIT            DEFAULT ((1)) NOT NULL,
    [CreatedOn]         DATETIME2 (7)  DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]         NVARCHAR (200) NOT NULL,
    [ModifiedOn]        DATETIME2 (7)  NULL,
    [ModifiedBy]        NVARCHAR (200) NULL,
    [DataSourceId]      INT            NULL,
    PRIMARY KEY CLUSTERED ([ConfigurationId] ASC)
);

