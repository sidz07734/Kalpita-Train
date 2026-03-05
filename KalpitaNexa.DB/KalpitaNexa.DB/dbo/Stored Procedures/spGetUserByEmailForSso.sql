
CREATE PROCEDURE [dbo].[spGetUserByEmailForSso]
/*
	Object Name : dbo.spGetUserByEmailForSso
	Object Type : StoredProcedure
	Created Date: 19-09-2025
	Created By  : Sayan Dutta
	Purpose     : Validates an SSO user by email (NO password check) and retrieves their info.
*/
(
    @UserEmail NVARCHAR(300)
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

    -- Step 1: Find the user by email. CRITICAL: Check if they are active, but DO NOT check password.
    SELECT
        @UserId = u.UserId,
        @UserName = u.UserName,
        @IsSuperAdmin = u.IsSuperAdmin
    FROM dbo.Users AS u WITH (NOLOCK)
    WHERE u.UserEmail = @UserEmail
      AND u.IsActive = 1; -- Ensure the user account is active.

    -- Step 2: If the user was found and is active, determine their role.
    IF @UserId IS NOT NULL
    BEGIN
        IF @IsSuperAdmin = 1
        BEGIN
            SET @UserRole = 'SuperAdmin';
            -- NOTE: SuperAdmin might not be associated with a specific tenant. @TenantId will be NULL.
        END
        ELSE
        BEGIN
            -- Get the role name and tenant from the mapping tables.
            SELECT TOP 1
                @UserRole = r.RoleName,
				@TenantId = r.TenantId
            FROM dbo.UserRoles AS tu WITH (NOLOCK)
            JOIN dbo.Roles AS r WITH (NOLOCK) ON tu.RoleId = r.RoleId
            WHERE tu.UserId = @UserId
              AND tu.IsActive = 1
              AND r.IsActive = 1;
        END

        -- Step 3: If a role was found, return all information in a single result set.
        -- This ensures that users who exist but have no active role assigned cannot log in.
        IF @UserRole IS NOT NULL
        BEGIN
            SELECT
                @UserId AS UserId,
                @UserName AS UserName,
                @UserEmail AS UserEmail,
                @UserRole AS UserRoleName, -- Renamed for consistency with the other SP's output
			    @TenantId AS TenantId;
        END
    END
    -- If user is not found, not active, or has no role, no rows will be returned.
END;