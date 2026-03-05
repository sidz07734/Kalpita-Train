CREATE TABLE [dbo].[UserOtps] (
    [OtpId]     INT              IDENTITY (1, 1) NOT NULL,
    [UserId]    UNIQUEIDENTIFIER NOT NULL,
    [Email]     NVARCHAR (300)   NOT NULL,
    [OtpCode]   NVARCHAR (10)    NULL,
    [OtpExpiry] DATETIME2 (7)    NULL,
    [CreatedOn] DATETIME2 (7)    CONSTRAINT [DF_UserOtps_CreatedOn] DEFAULT (sysutcdatetime()) NULL,
    CONSTRAINT [PK_UserOtps] PRIMARY KEY CLUSTERED ([OtpId] ASC)
);

