
CREATE PROCEDURE [dbo].[spGenerateAndStoreOtpForUser]
/*
	Object Name : dbo.spGenerateAndStoreOtpForUser
	Object Type : StoredProcedure
	Created Date: 17-09-2025
	Created By  : Sayan Dutta
	Purpose     : Finds a user by email, generates a 6-digit OTP, and stores it in the UserOtps table.
*/
(
    @UserEmail NVARCHAR(300)
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @UserId UNIQUEIDENTIFIER;
    DECLARE @OtpCode NVARCHAR(10);

    -- Step 1: Find the active user by email
    SELECT @UserId = UserId FROM dbo.Users WHERE UserEmail = @UserEmail AND IsActive = 1;

    IF @UserId IS NOT NULL
    BEGIN
        -- Step 2: Generate a 6-digit OTP
        SET @OtpCode = FORMAT(FLOOR(RAND() * (999999 - 100000 + 1) + 100000), '000000');

        -- Step 3: Upsert the OTP into the dedicated table
        -- Check if an OTP entry already exists for this user
        IF EXISTS (SELECT 1 FROM dbo.UserOtps WHERE UserId = @UserId)
        BEGIN
            -- Update the existing OTP record
            UPDATE dbo.UserOtps
            SET 
                OtpCode = @OtpCode,
                OtpExpiry = DATEADD(MINUTE, 10, GETUTCDATE()),
                CreatedOn = GETUTCDATE()
            WHERE UserId = @UserId;
        END
        ELSE
        BEGIN
            -- Insert a new OTP record
            INSERT INTO dbo.UserOtps (UserId, Email, OtpCode, OtpExpiry, CreatedOn)
            VALUES (@UserId, @UserEmail, @OtpCode, DATEADD(MINUTE, 5, GETUTCDATE()), GETUTCDATE());
        END

        -- Step 4: Return the generated OTP for the backend to email
        SELECT @OtpCode AS GeneratedOtp, 'OTP has been sent successfully.' AS Message, 1 AS Success;
    END
    ELSE
    BEGIN
        -- User not found or is inactive
        SELECT NULL AS GeneratedOtp, 'Email address not found or user is inactive.' AS Message, 0 AS Success;
    END
END;