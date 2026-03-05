CREATE TABLE [dbo].[ApplicationModels] (
    [ApplicationModelId] INT            IDENTITY (1, 1) NOT NULL,
    [AppId]              INT            NOT NULL,
    [ModuleID]           INT            NOT NULL,
    [IsDefault]          BIT            CONSTRAINT [DF_ApplicationModels_IsDefault] DEFAULT ((0)) NOT NULL,
    [IsActive]           BIT            CONSTRAINT [DF_ApplicationModels_IsActive] DEFAULT ((1)) NOT NULL,
    [CreatedOn]          DATETIME2 (7)  CONSTRAINT [DF_ApplicationModels_CreatedOn] DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]          NVARCHAR (200) NOT NULL,
    [ModifiedOn]         DATETIME2 (7)  NULL,
    [ModifiedBy]         NVARCHAR (200) NULL,
    PRIMARY KEY CLUSTERED ([ApplicationModelId] ASC),
    CONSTRAINT [FK_AppModel_App] FOREIGN KEY ([AppId]) REFERENCES [dbo].[Application] ([AppId]),
    CONSTRAINT [FK_AppModel_Model] FOREIGN KEY ([ModuleID]) REFERENCES [dbo].[Model] ([ModuleID]),
    CONSTRAINT [UQ_AppModel_App_Model] UNIQUE NONCLUSTERED ([AppId] ASC, [ModuleID] ASC)
);

