import React, { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAvatarColors, getInitials, loadProfile, LocalProfile, PROFILE_EVENT, saveProfile } from "@/lib/profile";

export const ProfileSetupDialog = () => {
  const [profile, setProfile] = useState<LocalProfile | null>(() => loadProfile());
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [avatarColor, setAvatarColor] = useState(getAvatarColors()[0]);

  useEffect(() => {
    const refresh = () => setProfile(loadProfile());
    window.addEventListener(PROFILE_EVENT, refresh as EventListener);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PROFILE_EVENT, refresh as EventListener);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const next = saveProfile({ displayName, role, avatarColor });
    if (next) setProfile(next);
  };

  const isOpen = !profile;

  return (
    <Dialog open={isOpen} onOpenChange={() => undefined}>
      <DialogContent hideClose className="bg-card border-border sm:max-w-[460px]" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
        <form onSubmit={save} className="space-y-5">
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
              <UserRound size={20} />
            </div>
            <DialogTitle>Set up your profile</DialogTitle>
            <DialogDescription>
              FlowBoard uses this local profile to assign new tickets and personalize summaries.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="profile-name">Your name</Label>
              <Input
                id="profile-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="e.g. Divya"
                autoFocus
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="profile-role">Role or focus</Label>
              <Input
                id="profile-role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="e.g. Solo builder, designer, student"
              />
            </div>

            <div className="grid gap-2">
              <Label>Avatar color</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: avatarColor }}>
                  {getInitials(displayName || "You")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {getAvatarColors().map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Use avatar color ${color}`}
                      onClick={() => setAvatarColor(color)}
                      className={`h-7 w-7 rounded-full border-2 ${avatarColor === color ? "border-foreground" : "border-transparent"}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={!displayName.trim()}>
            Continue
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
