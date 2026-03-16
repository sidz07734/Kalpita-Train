
CREATE   PROCEDURE [dbo].[spVerifyOtpAndResetPassword]
/*
	Object Name : dbo.spVerifyOtpAndResetPassword
	Object Type : StoredProcedure
	Created Date: 17-09-2025
	Created By  : Sayan Dutta
	Purpose     : Verifies an OTP from the UserOtps table and resets the user's password in the Users table.
*/
(
    @UserEmail NVARCHAR(300),
    @OtpCode NVARCHAR(10),
    @NewPasswordHash NVARCHAR(500)
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @UserId UNIQUEIDENTIFIER;
    DECLARE @StoredOtpCode NVARCHAR(10);
    DECLARE @OtpExpiry DATETIME2(7);

    -- Step 1: Find the user and retrieve their OTP details from the dedicated table
    SELECT
        @UserId = u.UserId,
        @StoredOtpCode = o.OtpCode,
        @OtpExpiry = o.OtpExpiry
    FROM dbo.Users AS u
    INNER JOIN dbo.UserOtps AS o ON u.UserId = o.UserId
    WHERE u.UserEmail = @UserEmail AND u.IsActive = 1;

    -- Step 2: Validate the findings
    IF @UserId IS NULL
    BEGIN
        SELECT 'No pending OTP request found for this email.' AS Message, 0 AS Success;
        RETURN;
    END

    IF @StoredOtpCode != @OtpCode
    BEGIN
        SELECT 'Invalid OTP code.' AS Message, 0 AS Success;
        RETURN;
    END

    IF GETUTCDATE() > @OtpExpiry
    BEGIN
        -- For security, remove the expired OTP
        DELETE FROM dbo.UserOtps WHERE UserId = @UserId;
        SELECT 'OTP code has expired. Please request a new one.' AS Message, 0 AS Success;
        RETURN;
    END

    -- Step 3: If all checks pass, update the password in the Users table
    UPDATE dbo.Users
    SET
        PasswordHash = @NewPasswordHash,
        ModifiedOn = GETUTCDATE()
    WHERE UserId = @UserId;

    -- Step 4: For security, delete the used OTP from the UserOtps table
    DELETE FROM dbo.UserOtps WHERE UserId = @UserId;

    SELECT 'Your password has been reset successfully.' AS Message, 1 AS Success;
END;