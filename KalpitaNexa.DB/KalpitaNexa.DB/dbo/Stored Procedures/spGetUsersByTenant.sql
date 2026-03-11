CREATE PROCEDURE [dbo].[spGetUsersByTenant]
/*
	Object Name : dbo.spGetUsersByTenant
	Object Type : StoredProcedure
	Created Date: 17-09-2025
	Created By  : Archana Gudise
	Purpose     : Retrieves all active users associated with a specific TenantId, including their role name.

 
    Modification: 
        1. Added @AppId parameter to filter users by a specific application.
        2. Added an INNER JOIN to dbo.UserApplication to ensure only users assigned to the specified app are returned.
*/
(
    @TenantId UNIQUEIDENTIFIER,
    @AppId INT -- ++ NEW PARAMETER ADDED ++
)
AS
BEGIN
    SET NOCOUNT ON;
 
    -- Step 1: Select all user details by joining Users, UserRoles, Roles, and now UserApplication tables.
    SELECT
        u.UserId,
        u.UserName,
        u.UserEmail,
        -- Use STRING_AGG to combine multiple roles for a user within the same tenant into one line
        STRING_AGG(r.RoleName, ', ') AS RoleName,
        u.IsActive,
        u.CreatedOn,
        u.CreatedBy,
        u.ModifiedOn,
        u.ModifiedBy
    FROM
        dbo.Users AS u
    INNER JOIN
        dbo.UserRoles AS tu ON u.UserId = tu.UserId
    INNER JOIN
        dbo.Roles AS r ON tu.RoleId = r.RoleId
    -- ++ NEW JOIN ADDED to filter by application ++
    INNER JOIN 
        dbo.UserApplication AS ua ON u.UserId = ua.UserId
    WHERE
        tu.TenantId = @TenantId -- Filter by the provided TenantId
        AND ua.AppId = @AppId     -- ++ NEW FILTER for the application ++
        AND u.IsActive = 1       -- Ensure the user account itself is active
        AND tu.IsActive = 1      -- Ensure the link between the user and the tenant is active
    GROUP BY 
        u.UserId,
        u.UserName,
        u.UserEmail,
        u.IsActive,
        u.CreatedOn,
        u.CreatedBy,
        u.ModifiedOn,
        u.ModifiedBy
    ORDER BY
        u.UserName ASC;          -- Return the list of users in alphabetical order
 
END;