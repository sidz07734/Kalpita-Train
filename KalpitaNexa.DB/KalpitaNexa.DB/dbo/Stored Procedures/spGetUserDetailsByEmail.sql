

CREATE PROCEDURE [dbo].[spGetUserDetailsByEmail]
/*
	Object Name : dbo.spGetUserDetailsByEmail
	Object Type : StoredProcedure
	Created Date: 26-09-2025
	Modified Date: 26-09-2025
	Created By  : Sayan Dutta
	Modified By : Sayan Dutta
	Purpose     : Retrieves a user's ID and an associated active Tenant ID based on their email address.
                  This is primarily used to hydrate session information for integrated applications.
*/
(
    @UserEmail NVARCHAR(300)
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE
        @UserId UNIQUEIDENTIFIER,
        @TenantId UNIQUEIDENTIFIER;

    -- Step 1: Find the active user's ID from the Users table based on the provided email.
    SELECT
        @UserId = u.UserId
    FROM
        dbo.Users AS u WITH (NOLOCK)
    WHERE
        u.UserEmail = @UserEmail
        AND u.IsActive = 1;

    -- Step 2: If an active user was found, find their associated active Tenant ID.
    -- We take the first active tenant found. In a multi-tenant scenario,
    -- the user's LastTenantId from the Users table could be prioritized if available.
    IF @UserId IS NOT NULL
    BEGIN
        SELECT TOP 1
            @TenantId = tu.TenantId
        FROM
            dbo.UserRoles AS tu WITH (NOLOCK)
        WHERE
            tu.UserId = @UserId
            AND tu.IsActive = 1;

        -- Step 3: Return the final details.
        -- If a user exists but has no active tenant assignment, TenantId will be NULL.
        SELECT
            @UserId AS UserId,
            @TenantId AS TenantId;
    END
    -- If no active user is found for the email, the procedure will return no rows.
END;