CREATE TABLE [dbo].[DataSources] (
    [DataSourceId]   INT            IDENTITY (1, 1) NOT NULL,
    [DataSourceName] NVARCHAR (200) NOT NULL,
    [DataSourceType] NVARCHAR (100) NOT NULL,
    [IsActive]       BIT            DEFAULT ((1)) NOT NULL,
    [CreatedOn]      DATETIME2 (7)  DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]      NVARCHAR (200) NOT NULL,
    [ModifiedOn]     DATETIME2 (7)  NULL,
    [ModifiedBy]     NVARCHAR (200) NULL,
    [AppId]          INT            NULL,
    PRIMARY KEY CLUSTERED ([DataSourceId] ASC),
    CONSTRAINT [FK_DataSources_Application] FOREIGN KEY ([AppId]) REFERENCES [dbo].[Application] ([AppId]),
    CONSTRAINT [UQ_DataSourceName_Per_App] UNIQUE NONCLUSTERED ([AppId] ASC, [DataSourceName] ASC)
);

