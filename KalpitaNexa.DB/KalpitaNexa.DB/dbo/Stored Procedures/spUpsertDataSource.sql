
-- We use CREATE OR ALTER to ensure it updates the existing one
CREATE   PROCEDURE [dbo].[spUpsertDataSource]
    @DataSourceId INT,
    @AppId INT,
    @DataSourceName NVARCHAR(200),
    @DataSourceType NVARCHAR(100),
    @IsActive BIT,
    @ExecutingUser NVARCHAR(200),
    @ConfigurationsJson NVARCHAR(MAX) = NULL -- <--- This 7th parameter MUST exist
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @CurrentDataSourceId INT = @DataSourceId;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Upsert the Data Source
        IF @CurrentDataSourceId > 0
        BEGIN
            UPDATE [dbo].[DataSources]
            SET
                [DataSourceName] = @DataSourceName,
                [DataSourceType] = @DataSourceType,
                [IsActive] = @IsActive,
                [ModifiedOn] = SYSUTCDATETIME(),
                [ModifiedBy] = @ExecutingUser
            WHERE
                [DataSourceId] = @CurrentDataSourceId
                AND [AppId] = @AppId;
        END
        ELSE
        BEGIN
            INSERT INTO [dbo].[DataSources] (
                [AppId], [DataSourceName], [DataSourceType], [IsActive], [CreatedBy]
            )
            VALUES (
                @AppId, @DataSourceName, @DataSourceType, @IsActive, @ExecutingUser
            );
            
            SET @CurrentDataSourceId = SCOPE_IDENTITY();
        END

        -- 2. Handle Configurations
        IF @ConfigurationsJson IS NOT NULL
        BEGIN
            -- Parse JSON
            ;WITH SourceConfigs AS (
                SELECT 
                    @AppId AS AppId,
                    @CurrentDataSourceId AS DataSourceId,
                    ConfigurationName,
                    ConfigKey,
                    ConfigValue,
                    Category,
                    @ExecutingUser AS UserBy
                FROM OPENJSON(@ConfigurationsJson)
                WITH (
                    ConfigurationName NVARCHAR(200) '$.configuration_name',
                    ConfigKey NVARCHAR(200) '$.config_key',
                    ConfigValue NVARCHAR(MAX) '$.config_value',
                    Category NVARCHAR(100) '$.category'
                )
            )
            -- MERGE (Upsert) Logic
            MERGE [dbo].[Configurations] AS TARGET
            USING SourceConfigs AS SOURCE
            ON TARGET.DataSourceId = SOURCE.DataSourceId 
               AND TARGET.ConfigKey = SOURCE.ConfigKey
            
            WHEN MATCHED THEN
                UPDATE SET 
                    TARGET.ConfigValue = SOURCE.ConfigValue,
                    TARGET.ConfigurationName = SOURCE.ConfigurationName,
                    TARGET.Category = SOURCE.Category,
                    TARGET.ModifiedOn = SYSUTCDATETIME(),
                    TARGET.ModifiedBy = SOURCE.UserBy,
                    TARGET.IsActive = 1

            WHEN NOT MATCHED BY TARGET THEN
                INSERT (AppId, DataSourceId, ConfigurationName, ConfigKey, ConfigValue, Category, IsActive, CreatedBy, CreatedOn)
                VALUES (SOURCE.AppId, SOURCE.DataSourceId, SOURCE.ConfigurationName, SOURCE.ConfigKey, SOURCE.ConfigValue, SOURCE.Category, 1, SOURCE.UserBy, SYSUTCDATETIME());
        END

        COMMIT TRANSACTION;
        
        -- Return the ID
        SELECT @CurrentDataSourceId as DataSourceId;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrorMessage, 16, 1);
    END CATCH
END