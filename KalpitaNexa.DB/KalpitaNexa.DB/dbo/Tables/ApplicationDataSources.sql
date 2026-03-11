CREATE TABLE [dbo].[ApplicationDataSources] (
    [ApplicationDataSourceId] INT            IDENTITY (1, 1) NOT NULL,
    [AppId]                   INT            NOT NULL,
    [DataSourceId]            INT            NOT NULL,
    [IsDefault]               BIT            CONSTRAINT [DF_ApplicationDataSources_IsDefault] DEFAULT ((0)) NOT NULL,
    [IsActive]                BIT            CONSTRAINT [DF_ApplicationDataSources_IsActive] DEFAULT ((1)) NOT NULL,
    [CreatedOn]               DATETIME2 (7)  CONSTRAINT [DF_ApplicationDataSources_CreatedOn] DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]               NVARCHAR (200) NOT NULL,
    [ModifiedOn]              DATETIME2 (7)  NULL,
    [ModifiedBy]              NVARCHAR (200) NULL,
    PRIMARY KEY CLUSTERED ([ApplicationDataSourceId] ASC),
    CONSTRAINT [FK_AppData_App] FOREIGN KEY ([AppId]) REFERENCES [dbo].[Application] ([AppId]),
    CONSTRAINT [FK_AppData_DataSource] FOREIGN KEY ([DataSourceId]) REFERENCES [dbo].[DataSources] ([DataSourceId]),
    CONSTRAINT [UQ_AppData_App_Data] UNIQUE NONCLUSTERED ([AppId] ASC, [DataSourceId] ASC)
);

