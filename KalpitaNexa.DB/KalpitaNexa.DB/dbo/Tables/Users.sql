CREATE TABLE [dbo].[Users] (
    [UserId]        UNIQUEIDENTIFIER DEFAULT (newid()) NOT NULL,
    [UserName]      NVARCHAR (200)   NOT NULL,
    [UserEmail]     NVARCHAR (300)   NOT NULL,
    [PasswordHash]  NVARCHAR (500)   NOT NULL,
    [IsSuperAdmin]  BIT              DEFAULT ((0)) NOT NULL,
    [IsActive]      BIT              DEFAULT ((1)) NOT NULL,
    [CreatedOn]     DATETIME2 (7)    DEFAULT (sysutcdatetime()) NOT NULL,
    [CreatedBy]     NVARCHAR (200)   NOT NULL,
    [ModifiedOn]    DATETIME2 (7)    NULL,
    [ModifiedBy]    NVARCHAR (200)   NULL,
    [DefaultAppId]  INT              NULL,
    [PartitionYear] AS               (datepart(year,[CreatedOn])) PERSISTED,
    PRIMARY KEY CLUSTERED ([UserId] ASC),
    CONSTRAINT [FK_Users_DefaultApplication] FOREIGN KEY ([DefaultAppId]) REFERENCES [dbo].[Application] ([AppId]),
    UNIQUE NONCLUSTERED ([UserEmail] ASC)
);


GO
CREATE NONCLUSTERED INDEX [NCI_Users_Partitioned]
    ON [dbo].[Users]([PartitionYear] ASC, [UserId] ASC)
    ON [ps_Users_Year] ([PartitionYear]);

