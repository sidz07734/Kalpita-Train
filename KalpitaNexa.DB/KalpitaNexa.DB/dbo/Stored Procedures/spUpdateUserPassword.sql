
CREATE PROCEDURE [dbo].[spUpdateUserPassword]
/*
	Object Name : dbo.spChangeUserPassword
	Object Type : StoredProcedure
	Created Date: 19-09-2025
	Created By  : Sayan Dutta
	Purpose     : Allows a logged-in user to change their password after verifying the old one.
*/
(
    @UserEmail NVARCHAR(300),
    @OldPasswordHash NVARCHAR(500),
    @NewPasswordHash NVARCHAR(500),
    @ModifiedBy NVARCHAR(300) -- Can be the user's own email
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @UserId UNIQUEIDENTIFIER;

    -- Step 1: Verify the user exists and the OLD password hash is correct.
    SELECT @UserId = u.UserId
    FROM dbo.Users AS u WITH (NOLOCK)
    WHERE u.UserEmail = @UserEmail
      AND u.PasswordHash = @OldPasswordHash
      AND u.IsActive = 1;

    -- Step 2: If verification is successful, update to the new password hash.
    IF @UserId IS NOT NULL
    BEGIN
        UPDATE dbo.Users
        SET
            PasswordHash = @NewPasswordHash,
            ModifiedOn = SYSUTCDATETIME(),
            ModifiedBy = @ModifiedBy
        WHERE UserId = @UserId;

        -- Return a success message
        SELECT 'Success' AS ResultStatus, 'Password changed successfully.' AS ResultMessage;
    END
    ELSE
    BEGIN
        -- If verification fails, return an error message.
        SELECT 'Error' AS ResultStatus, 'Incorrect old password.' AS ResultMessage;
    END
END