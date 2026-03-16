CREATE TABLE [dbo].[ApplicationRoles] (
    [AppRoleId]   INT            IDENTITY (1, 1) NOT NULL,
    [AppId]       INT            NOT NULL,
    [RoleId]      INT            NOT NULL,
    [FieldConfig] NVARCHAR (MAX) NULL,
    [IsActive]    BIT            DEFAULT ((1)) NOT NULL,
    [CreatedOn]   DATETIME2 (7)  DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]   NVARCHAR (200) NOT NULL,
    [ModifiedOn]  DATETIME2 (7)  NULL,
    [ModifiedBy]  NVARCHAR (200) NULL,
    PRIMARY KEY CLUSTERED ([AppRoleId] ASC)
);

