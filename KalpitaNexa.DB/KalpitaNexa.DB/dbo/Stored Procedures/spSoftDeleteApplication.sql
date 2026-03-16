
CREATE PROCEDURE [dbo].[spSoftDeleteApplication]
    @AppId INT,
    @ExecutingUser NVARCHAR(200)
AS
/*
	Object Name : dbo.spSoftDeleteApplication
    Object Type : StoredProcedure
    Purpose: Soft-deletes an application by setting its IsActive flag to 0.
    Author: Pravalika Konidala
    Date Created: 2025-11-18
    Modification: Initial creation.
*/
BEGIN
    SET NOCOUNT ON;

    -- Check if the application exists before attempting to update
    IF NOT EXISTS (SELECT 1 FROM [dbo].[Application] WHERE [AppId] = @AppId)
    BEGIN
        RAISERROR('Application with the specified AppId does not exist.', 16, 1);
        RETURN;
    END
    UPDATE [dbo].[Application]
    SET
        [IsActive] = 0, 
        [ModifiedOn] = SYSUTCDATETIME(),
        [ModifiedBy] = @ExecutingUser
    WHERE
        [AppId] = @AppId;

END