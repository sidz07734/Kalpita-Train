CREATE TABLE [dbo].[Model] (
    [ModuleID]   INT            IDENTITY (1, 1) NOT NULL,
    [ModuleName] NVARCHAR (255) NOT NULL,
    [CreatedOn]  DATETIME2 (7)  DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]  NVARCHAR (200) NOT NULL,
    [ModifiedOn] DATETIME2 (7)  NULL,
    [ModifiedBy] NVARCHAR (200) NULL,
    PRIMARY KEY CLUSTERED ([ModuleID] ASC)
);

