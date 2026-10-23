import React from "react";

import { ToggleGroup } from "@quenti/components/toggle-group";

import { Text, VStack, useColorMode } from "@chakra-ui/react";

import {
  enableSystemTheme,
  useSystemThemeActive,
  useSystemThemeAvailable,
} from "../../lib/system-theme/client";
import { SettingsContext } from "../../pages/settings";
import { ThemePreview } from "../onboarding/theme-preview";
import { SectionWrapper } from "./section-wrapper";

export const Theme = () => {
  const { colorMode, setColorMode } = useColorMode();
  const systemActive = useSystemThemeActive();
  const systemAvailable = useSystemThemeAvailable();
  const lightSelected = !systemActive && colorMode == "light";
  const darkSelected = !systemActive && colorMode == "dark";

  const layout = React.useContext(SettingsContext)!.layout;

  return (
    <SectionWrapper
      heading="Theme"
      description="Change the theme for this device"
    >
      <VStack>
        <ToggleGroup
          index={systemActive ? 2 : colorMode == "light" ? 0 : 1}
          orientation={layout == "mobile" ? "vertical" : "horizontal"}
          tabProps={{
            w: 72,
            h: 48,
          }}
        >
          <ToggleGroup.Tab
            onClick={(e) => {
              e.preventDefault();
              setColorMode("light");
            }}
          >
            <VStack spacing="3">
              <ThemePreview variant="light" selected={lightSelected} />
              <Text fontWeight={600}>Light</Text>
            </VStack>
          </ToggleGroup.Tab>
          <ToggleGroup.Tab
            onClick={(e) => {
              e.preventDefault();
              setColorMode("dark");
            }}
          >
            <VStack spacing="3">
              <ThemePreview variant="dark" selected={darkSelected} />
              <Text fontWeight={600}>Dark</Text>
            </VStack>
          </ToggleGroup.Tab>
          {systemAvailable && (
            <ToggleGroup.Tab
              onClick={(e) => {
                e.preventDefault();
                enableSystemTheme();
              }}
            >
              <VStack spacing="3">
                <ThemePreview variant="system" selected={systemActive} />
                <Text fontWeight={600}>System</Text>
              </VStack>
            </ToggleGroup.Tab>
          )}
        </ToggleGroup>
      </VStack>
    </SectionWrapper>
  );
};
