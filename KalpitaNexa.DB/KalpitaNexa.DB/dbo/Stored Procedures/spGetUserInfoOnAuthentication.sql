

CREATE PROCEDURE [dbo].[spGetUserInfoOnAuthentication]
/*
	Object Name : dbo.spAuthenticateUserAndGetBaseInfo
	Object Type : StoredProcedure
	Created Date: 08-09-2025
	Modified Date: 16-09-2025
	Created By  : Pravalika Konidala
	Modified By :Sayan Dutta
	Purpose     : Authenticates a user and retrieves their basic information and role.
*/
(
    @UserEmail NVARCHAR(300),
    @PasswordHash NVARCHAR(500)
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE
        @UserId UNIQUEIDENTIFIER,
        @UserName NVARCHAR(200),
        @IsSuperAdmin BIT,
        @UserRole NVARCHAR(200),
		@TenantId UNIQUEIDENTIFIER;

    -- Step 1: Authenticate the user and get basic details
    SELECT
        @UserId = u.UserId,
        @UserName = u.UserName,
        @IsSuperAdmin = u.IsSuperAdmin
    FROM dbo.Users AS u WITH (NOLOCK)
    WHERE u.UserEmail = @UserEmail
      AND u.PasswordHash = @PasswordHash
      AND u.IsActive = 1;

    -- Step 2: If user is authenticated, determine their role
    IF @UserId IS NOT NULL
    BEGIN
        IF @IsSuperAdmin = 1
        BEGIN
            SET @UserRole = 'SuperAdmin';
        END
        ELSE
        BEGIN
            -- Get the role name from the mapping and roles tables
            SELECT TOP 1
                @UserRole = r.RoleName,
				@TenantId = r.TenantId
            FROM dbo.UserRoles AS tu WITH (NOLOCK)
            JOIN dbo.Roles AS r WITH (NOLOCK) ON tu.RoleId = r.RoleId
            WHERE tu.UserId = @UserId
              AND tu.IsActive = 1
              AND r.IsActive = 1;
        END

        -- Step 3: Return all information in a single result set
        SELECT
            @UserId AS UserId,
            @UserName AS UserName,
            @UserEmail AS UserEmail,
            @UserRole AS UserRole, 
			@TenantId AS TenantId;
    END
    -- If authentication fails, no rows will be returned.
END;